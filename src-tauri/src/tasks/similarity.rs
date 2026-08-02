// SPEC: mcp-task-server (MCP-07)

//! Task similarity scoring for dedup suggestions (P2 "Similaridade e dedup").
//!
//! `find_similar` compares a candidate title/description (what the caller is
//! about to create) against every currently ACTIVE task (`pending`,
//! `in_progress`, `in_testing` — never `completed`, see design.md's rationale
//! that a finished task is not a duplicate candidate) and recommends whether
//! to reuse one, ask the user, or proceed with a new task.
//!
//! **Algorithm choice: character trigram overlap (Szymkiewicz-Simpson)
//! coefficient**, not Levenshtein and not the plainer Dice coefficient.
//! Task titles are short, free-form phrases where word order and phrasing
//! vary a lot between two descriptions of the *same* piece of work ("Add
//! pagination" vs "Implement pagination in the list"): Levenshtein counts
//! single-character edits along the whole string and is dominated by the
//! length difference between a short and a long phrase, so two paraphrases of
//! the same task can end up looking no more similar than two unrelated
//! sentences of similar length.
//!
//! A first pass used the Dice coefficient (`2*|intersection| / (|A|+|B|)`),
//! which is the textbook choice for trigram similarity. Measured against
//! this module's own test pairs it under-scored exactly the case this task
//! exists to catch: "Add pagination" vs "Implement pagination in the list"
//! scored ~0.43 with Dice — below the 0.70 reuse threshold — because Dice
//! normalizes by the *combined* size of both trigram sets, so a short title
//! compared against a longer paraphrase is punished for the length gap even
//! when nearly all of the short side's trigrams are present in the long
//! side. Switching the normalizer to `min(|A|, |B|)` (the overlap /
//! containment coefficient) fixes this: it asks "how much of the smaller
//! side is contained in the larger side", which is the right question for
//! "same work, shorter title" pairs, and pushes that pair to 0.75. The
//! trade-off is accepted deliberately: a short, generic candidate title has
//! more chance of scoring high against an unrelated long task than under
//! Dice, but the failure mode of a false-positive here is cheap (the caller
//! only gets a "maybe reuse" or "ask the user" suggestion, never an
//! automatic action), while a false negative silently lets a duplicate task
//! get created — the asymmetry favors the more forgiving coefficient.
//!
//! Both coefficients are symmetric, bounded in `0.0..=1.0` by construction,
//! trivial to implement without a new dependency
//! (`std::collections::HashMap` multiset overlap), and O(n) after
//! generating the trigram sets — only the normalizer changed.

use std::collections::HashMap;

use super::service::Task;
use super::state::TaskStatus;

/// What `find_similar` recommends doing with a candidate task, based on the
/// highest similarity score found among the active existing tasks.
#[derive(Debug, Clone, PartialEq)]
pub enum SimilarityRecommendation {
    /// Best match scored strictly above 0.70: recommend reusing that task
    /// instead of creating a new one.
    Reuse { task_id: i64, score: f64 },
    /// Best match scored in `0.50..=0.70`: close enough to be worth asking
    /// the user, not confident enough to auto-reuse.
    AskUser { task_id: i64, score: f64 },
    /// Nothing scored 0.50 or above, or there were no active tasks to
    /// compare against.
    None,
}

/// Compares `candidate_title`/`candidate_description` against every ACTIVE
/// task in `existing` (i.e. `task.status != TaskStatus::Completed`) and
/// returns a recommendation based on the single highest-scoring match.
///
/// Comparison text for both sides is built as `"{title} {description}"`
/// (empty string when there is no description), then scored with
/// [`trigram_overlap`]. See the module doc comment for why the trigram
/// overlap coefficient was chosen over Levenshtein and over the plainer
/// Dice coefficient.
pub fn find_similar(
    candidate_title: &str,
    candidate_description: Option<&str>,
    existing: &[Task],
) -> SimilarityRecommendation {
    let candidate_text = format!(
        "{candidate_title} {}",
        candidate_description.unwrap_or_default()
    );

    let mut best: Option<(i64, f64)> = None;

    for task in existing {
        if task.status == TaskStatus::Completed {
            continue;
        }

        let existing_text = format!(
            "{} {}",
            task.title,
            task.description.as_deref().unwrap_or_default()
        );
        let score = trigram_overlap(&candidate_text, &existing_text);

        let is_better = match best {
            Some((_, best_score)) => score > best_score,
            None => true,
        };
        if is_better {
            best = Some((task.id, score));
        }
    }

    match best {
        Some((task_id, score)) if score > 0.70 => {
            SimilarityRecommendation::Reuse { task_id, score }
        }
        Some((task_id, score)) if (0.50..=0.70).contains(&score) => {
            SimilarityRecommendation::AskUser { task_id, score }
        }
        _ => SimilarityRecommendation::None,
    }
}

/// Character trigrams of `s`, lowercased and with runs of whitespace
/// collapsed to a single space first (so "Add  pagination" and "add
/// pagination" produce identical trigram sets). Strings shorter than 3
/// characters (after normalization) collapse to a single one-element gram
/// list containing the whole normalized string, rather than an empty list —
/// this lets two very short, identical candidates still score `1.0` instead
/// of comparing two empty sets (which `trigram_dice` treats as unrelated,
/// see its doc comment).
fn trigrams(s: &str) -> Vec<String> {
    let normalized = s
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let chars: Vec<char> = normalized.chars().collect();

    if chars.is_empty() {
        return Vec::new();
    }
    if chars.len() < 3 {
        return vec![normalized];
    }

    chars.windows(3).map(|w| w.iter().collect()).collect()
}

/// Overlap (Szymkiewicz-Simpson) coefficient over the character-trigram
/// **multisets** of `a` and `b`: `|intersection| / min(|A|, |B|)`, counting
/// repeated trigrams on both sides (multiset intersection, not set
/// intersection) so a repeated substring contributes proportionally rather
/// than being collapsed to one hit. Always in `0.0..=1.0` — the intersection
/// of two multisets can never exceed the smaller one's size. See the module
/// doc comment for why this normalizes by `min(|A|, |B|)` instead of the
/// Dice coefficient's `|A| + |B|`.
///
/// Two strings that both normalize to nothing (empty/whitespace-only) score
/// `0.0`, not `1.0` — there is no real text to call "similar" here, and this
/// keeps the function's range meaningful for `find_similar`'s empty-active-
/// task-list caller who never reaches this path anyway (title is required
/// upstream).
fn trigram_overlap(a: &str, b: &str) -> f64 {
    let grams_a = trigrams(a);
    let grams_b = trigrams(b);

    if grams_a.is_empty() || grams_b.is_empty() {
        return 0.0;
    }

    let mut counts_a: HashMap<&str, i32> = HashMap::new();
    for g in &grams_a {
        *counts_a.entry(g.as_str()).or_insert(0) += 1;
    }

    let mut counts_b: HashMap<&str, i32> = HashMap::new();
    for g in &grams_b {
        *counts_b.entry(g.as_str()).or_insert(0) += 1;
    }

    let mut intersection = 0i32;
    for (gram, count_a) in &counts_a {
        if let Some(count_b) = counts_b.get(gram) {
            intersection += (*count_a).min(*count_b);
        }
    }

    let smaller = (grams_a.len() as f64).min(grams_b.len() as f64);
    intersection as f64 / smaller
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(id: i64, title: &str, description: Option<&str>, status: TaskStatus) -> Task {
        Task {
            id,
            title: title.to_string(),
            description: description.map(str::to_string),
            plan: None,
            implementation: None,
            status,
            project_id: None,
            terminal_id: "term-1".to_string(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn identical_candidate_scores_near_one_and_recommends_reuse() {
        let existing = vec![make_task(
            1,
            "Add pagination to the task list",
            Some("Server-side pagination for large task sets"),
            TaskStatus::Pending,
        )];

        let result = find_similar(
            "Add pagination to the task list",
            Some("Server-side pagination for large task sets"),
            &existing,
        );

        match result {
            SimilarityRecommendation::Reuse { task_id, score } => {
                assert_eq!(task_id, 1);
                assert!(
                    score >= 0.99,
                    "identical text should score ~1.0, got {score}"
                );
            }
            other => panic!("expected Reuse for an identical candidate, got {other:?}"),
        }
    }

    #[test]
    fn unrelated_candidate_scores_near_zero_and_recommends_none() {
        let existing = vec![make_task(
            1,
            "Add pagination to the task list",
            Some("Server-side pagination for large task sets"),
            TaskStatus::Pending,
        )];

        let result = find_similar(
            "Fix the terminal color theme on Windows",
            Some("ANSI colors are inverted in the light theme"),
            &existing,
        );

        match result {
            SimilarityRecommendation::None => {}
            other => panic!("expected None for an unrelated candidate, got {other:?}"),
        }

        // Also assert the underlying score directly, so this test fails
        // loudly (not just via the enum variant) if the algorithm ever
        // drifts on this pair. Measured against the real overlap
        // coefficient this pair sits around 0.14 (a handful of common
        // short trigrams like " th", "he ", " co" are shared by chance
        // between any two English sentences) — nowhere near the 0.50
        // ask-user threshold, which is the property that actually matters.
        let candidate_text =
            "Fix the terminal color theme on Windows ANSI colors are inverted in the light theme";
        let existing_text =
            "Add pagination to the task list Server-side pagination for large task sets";
        let score = trigram_overlap(candidate_text, existing_text);
        assert!(
            score < 0.25,
            "unrelated text should score well under the 0.50 ask-user threshold, got {score}"
        );
    }

    #[test]
    fn paraphrased_pagination_request_falls_in_high_range_and_recommends_reuse() {
        // The task brief's own worked example: two phrasings of the same
        // piece of work, different wording and word order. This is the
        // pair the trigram-Dice choice has to actually get right.
        let existing = vec![make_task(1, "Add pagination", None, TaskStatus::InProgress)];

        let result = find_similar("Implement pagination in the list", None, &existing);

        match result {
            SimilarityRecommendation::Reuse { task_id, score } => {
                assert_eq!(task_id, 1);
                assert!(
                    score > 0.70,
                    "paraphrased pagination request should score > 0.70, got {score}"
                );
            }
            other => panic!("expected Reuse for a paraphrase of the same task, got {other:?}"),
        }
    }

    #[test]
    fn moderately_similar_pair_falls_in_mid_range_and_recommends_ask_user() {
        // Calibrated pair: both mention "the dashboard" and share some
        // structure ("Refactor ... code" / "Redesign ... layout"), but talk
        // about different aspects of it, landing this pair's trigram-Dice
        // score in [0.50, 0.70] rather than the "same task" high range.
        let existing = vec![make_task(
            1,
            "Refactor the dashboard loading code",
            None,
            TaskStatus::InTesting,
        )];

        let result = find_similar("Redesign the dashboard layout code", None, &existing);

        match result {
            SimilarityRecommendation::AskUser { task_id, score } => {
                assert_eq!(task_id, 1);
                assert!(
                    (0.50..=0.70).contains(&score),
                    "expected score in [0.50, 0.70], got {score}"
                );
            }
            other => panic!("expected AskUser for a moderately similar pair, got {other:?}"),
        }
    }

    #[test]
    fn slightly_similar_but_low_pair_recommends_none() {
        // Shares only a couple of short, generic words ("the", "in") with
        // otherwise unrelated content — some overlap, but well under 0.50.
        let existing = vec![make_task(
            1,
            "Update the changelog in the docs folder",
            None,
            TaskStatus::Pending,
        )];

        let result = find_similar("Rename the icon in the settings menu", None, &existing);

        let candidate_text = "Rename the icon in the settings menu ";
        let existing_text = "Update the changelog in the docs folder ";
        let score = trigram_overlap(candidate_text, existing_text);
        assert!(score < 0.50, "expected score < 0.50, got {score}");

        match result {
            SimilarityRecommendation::None => {}
            other => panic!("expected None for a low-similarity pair, got {other:?}"),
        }
    }

    #[test]
    fn completed_tasks_are_ignored_even_when_near_identical() {
        // Only a near-identical task is present, but it's Completed: it must
        // never be recommended. With no other active task, the result has
        // to be None even though an uncompleted twin would have scored
        // above 0.70.
        let existing = vec![make_task(
            1,
            "Add pagination to the task list",
            Some("Server-side pagination for large task sets"),
            TaskStatus::Completed,
        )];

        let result = find_similar(
            "Add pagination to the task list",
            Some("Server-side pagination for large task sets"),
            &existing,
        );

        assert_eq!(result, SimilarityRecommendation::None);

        // Now add a less-similar (different wording, no description) but
        // ACTIVE task alongside the completed twin: the active one must
        // win, proving completed tasks are skipped entirely rather than
        // merely deprioritized.
        let mut existing_with_active = existing;
        existing_with_active.push(make_task(
            2,
            "Add pagination for the tasks list",
            None,
            TaskStatus::Pending,
        ));

        let result = find_similar(
            "Add pagination to the task list",
            Some("Server-side pagination for large task sets"),
            &existing_with_active,
        );

        match result {
            SimilarityRecommendation::Reuse { task_id, .. } => assert_eq!(task_id, 2),
            other => panic!(
                "expected the active task to be recommended over the completed twin, got {other:?}"
            ),
        }
    }
}
