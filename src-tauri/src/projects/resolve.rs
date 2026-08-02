// SPEC: projects (PROJ-03, PROJ-04)

//! Directory-based project resolution.
//!
//! Maps a terminal's `cwd` to the project it belongs to, so a task created
//! from that terminal is tagged automatically (PROJ-03). This is a pure
//! function on purpose: it takes an already-loaded slice of `Project`s
//! rather than a `&Connection`, so it needs no database and no filesystem
//! access to be tested. The caller (a future `TaskService`) is responsible
//! for fetching the project list via `ProjectService` before calling this.
//!
//! Matching rule: `cwd` matches a project if it is equal to, or a subfolder
//! of, `project.path`. When more than one project matches (one nested
//! inside another's registered path), the most specific one — the longer
//! path, i.e. more path components — wins. When nothing matches, resolution
//! falls back to the last path component of `cwd` as a project name,
//! without failing (PROJ-04).
//!
//! Paths are compared by component, not by raw string: both `\` and `/`
//! are accepted as separators regardless of host OS (a stored project path
//! and a live `cwd` can each use either), and on Windows the comparison is
//! case-insensitive since NTFS is case-insensitive by default. This module
//! never touches the filesystem (no `canonicalize`), since `cwd` or a
//! registered project path may no longer exist on disk.

use std::path::Path;

use super::service::Project;

/// Outcome of resolving a `cwd` against the known projects.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    /// `cwd` matched an existing project, either exactly or as a subfolder.
    Matched(Project),
    /// No project matched; `folder_name` is `cwd`'s last path component.
    Fallback { folder_name: String },
}

/// Resolves `cwd` to the most specific matching project in `projects`, or a
/// fallback carrying the folder name. Never fails.
pub fn resolve(cwd: &Path, projects: &[Project]) -> Resolution {
    let cwd_components = normalized_components(cwd);

    let mut best: Option<(&Project, usize)> = None;

    for project in projects {
        let project_components = normalized_components(Path::new(&project.path));
        if !is_prefix(&project_components, &cwd_components) {
            continue;
        }

        let specificity = project_components.len();
        let is_more_specific = match best {
            Some((_, best_len)) => specificity > best_len,
            None => true,
        };
        if is_more_specific {
            best = Some((project, specificity));
        }
    }

    match best {
        Some((project, _)) => Resolution::Matched(project.clone()),
        None => Resolution::Fallback {
            folder_name: folder_name(cwd),
        },
    }
}

/// True when `prefix`'s components are a prefix of `full`'s (including the
/// exact-match case where they're equal). An empty `prefix` never matches —
/// a project can't legitimately have an empty registered path.
fn is_prefix(prefix: &[String], full: &[String]) -> bool {
    !prefix.is_empty() && full.len() >= prefix.len() && full[..prefix.len()] == prefix[..]
}

/// Splits a path into its components, accepting both `\` and `/` as
/// separators regardless of host OS, and lowercasing on Windows so the
/// comparison matches NTFS's default case-insensitivity. Deliberately does
/// not touch the filesystem — no `canonicalize` — since either side of the
/// comparison may point to a path that no longer exists.
fn normalized_components(path: &Path) -> Vec<String> {
    path.to_string_lossy()
        .replace('\\', "/")
        .split('/')
        .filter(|c| !c.is_empty())
        .map(|c| {
            if cfg!(windows) {
                c.to_lowercase()
            } else {
                c.to_string()
            }
        })
        .collect()
}

/// Last path component of `cwd`, in its original case, used as the
/// fallback project name. Same manual separator handling as
/// `normalized_components` (no reliance on `Path::file_name`, which only
/// recognizes `\` as a separator on Windows and `/` on Unix).
fn folder_name(cwd: &Path) -> String {
    cwd.to_string_lossy()
        .replace('\\', "/")
        .split('/')
        .rfind(|c| !c.is_empty())
        .unwrap_or_default()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(id: &str, name: &str, path: &str) -> Project {
        Project {
            id: id.to_string(),
            name: name.to_string(),
            path: path.to_string(),
            color: "#3b82f6".to_string(),
            last_used: None,
        }
    }

    #[test]
    fn exact_path_matches_project() {
        let p = project("1", "swarmdeck", "/home/dev/swarmdeck");
        let resolution = resolve(Path::new("/home/dev/swarmdeck"), std::slice::from_ref(&p));
        assert_eq!(resolution, Resolution::Matched(p));
    }

    #[test]
    fn subfolder_resolves_to_ancestor_project() {
        let p = project("1", "swarmdeck", "/home/dev/swarmdeck");
        let resolution = resolve(
            Path::new("/home/dev/swarmdeck/src-tauri/src"),
            std::slice::from_ref(&p),
        );
        assert_eq!(resolution, Resolution::Matched(p));
    }

    #[test]
    fn most_specific_project_wins_among_two_matches() {
        // "swarmdeck" is registered at the repo root; "backend" is
        // registered at a nested subfolder that also contains `cwd`. Both
        // are ancestors of `cwd`, so the deeper one must win.
        let outer = project("1", "swarmdeck", "/home/dev/swarmdeck");
        let inner = project("2", "backend", "/home/dev/swarmdeck/src-tauri");

        let resolution = resolve(
            Path::new("/home/dev/swarmdeck/src-tauri/src/projects"),
            &[outer, inner.clone()],
        );

        assert_eq!(resolution, Resolution::Matched(inner));
    }

    #[test]
    fn no_match_falls_back_to_folder_name() {
        let p = project("1", "swarmdeck", "/home/dev/swarmdeck");
        let resolution = resolve(Path::new("/home/dev/other-project"), &[p]);
        assert_eq!(
            resolution,
            Resolution::Fallback {
                folder_name: "other-project".to_string(),
            }
        );
    }

    #[test]
    fn mixed_separators_still_resolve() {
        // Project registered with backslashes, `cwd` passed with forward
        // slashes (or vice versa) — both must normalize to the same
        // components.
        let p = project("1", "swarmdeck", r"C:\dev\swarmdeck");
        let resolution = resolve(
            Path::new("C:/dev/swarmdeck/src-tauri"),
            std::slice::from_ref(&p),
        );
        assert_eq!(resolution, Resolution::Matched(p));
    }

    // Case-insensitivity is a Windows-only guarantee (NTFS default); on
    // case-sensitive POSIX filesystems, differently-cased paths are
    // legitimately different directories, so this test only runs on
    // Windows targets, matching `normalized_components`'s `cfg!(windows)`
    // branch.
    #[cfg(windows)]
    #[test]
    fn windows_case_insensitive_match() {
        let p = project("1", "swarmdeck", r"c:\users\dev");
        let resolution = resolve(Path::new(r"C:\Users\Dev"), std::slice::from_ref(&p));
        assert_eq!(resolution, Resolution::Matched(p));
    }
}
