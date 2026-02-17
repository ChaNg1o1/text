use crate::lexical;

/// Sentence-level metrics.
pub struct SentenceMetrics {
    pub sentence_count: usize,
    pub avg_sentence_length: f64,
    pub sentence_length_variance: f64,
}

/// Split text into sentences based on terminal punctuation.
///
/// Handles both Latin (.!?) and CJK (。！？) sentence boundaries.
/// Consecutive terminators are collapsed (e.g. "!!!" counts as one boundary).
/// Trailing non-sentence text (no terminator) is treated as a sentence if non-empty.
fn split_sentences(text: &str) -> Vec<&str> {
    let mut sentences = Vec::new();
    let mut start = 0;
    let mut prev_was_terminator = false;

    for (i, c) in text.char_indices() {
        let is_terminator = matches!(c, '.' | '!' | '?' | '。' | '！' | '？');

        if is_terminator {
            if !prev_was_terminator {
                // End of sentence: from start to just after this character.
                let end = i + c.len_utf8();
                let segment = &text[start..end];
                let trimmed = segment.trim();
                if !trimmed.is_empty() {
                    sentences.push(trimmed);
                }
            }
            // Move start past this terminator.
            start = i + c.len_utf8();
            prev_was_terminator = true;
        } else {
            prev_was_terminator = false;
        }
    }

    // Handle trailing text without a sentence terminator.
    if start < text.len() {
        let remainder = text[start..].trim();
        if !remainder.is_empty() {
            sentences.push(remainder);
        }
    }

    sentences
}

/// Compute sentence-level statistics.
pub fn compute_sentence_metrics(text: &str) -> SentenceMetrics {
    let sentences = split_sentences(text);
    let sentence_count = sentences.len();

    if sentence_count == 0 {
        return SentenceMetrics {
            sentence_count: 0,
            avg_sentence_length: 0.0,
            sentence_length_variance: 0.0,
        };
    }

    // Token count per sentence.
    let lengths: Vec<f64> = sentences
        .iter()
        .map(|s| lexical::tokenize(s).len() as f64)
        .collect();

    let n = lengths.len() as f64;
    let sum: f64 = lengths.iter().sum();
    let avg = sum / n;

    // Population variance.
    let variance = if n > 1.0 {
        let sq_diff_sum: f64 = lengths.iter().map(|&l| (l - avg).powi(2)).sum();
        sq_diff_sum / n
    } else {
        0.0
    };

    SentenceMetrics {
        sentence_count,
        avg_sentence_length: avg,
        sentence_length_variance: variance,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_sentences_english() {
        let sentences = split_sentences("Hello world. How are you? I'm fine!");
        assert_eq!(sentences.len(), 3);
        assert_eq!(sentences[0], "Hello world.");
        assert_eq!(sentences[1], "How are you?");
        assert_eq!(sentences[2], "I'm fine!");
    }

    #[test]
    fn test_split_sentences_cjk() {
        let sentences = split_sentences("你好世界。今天天气不错！是的？");
        assert_eq!(sentences.len(), 3);
    }

    #[test]
    fn test_split_sentences_consecutive_punctuation() {
        let sentences = split_sentences("Really?! Yes!!!");
        assert_eq!(sentences.len(), 2);
    }

    #[test]
    fn test_split_sentences_trailing_text() {
        let sentences = split_sentences("First sentence. Trailing text");
        assert_eq!(sentences.len(), 2);
    }

    #[test]
    fn test_sentence_metrics_basic() {
        let m = compute_sentence_metrics("Hello world. Foo bar baz.");
        assert_eq!(m.sentence_count, 2);
        // Sentence 1: "Hello world." -> 2 tokens, Sentence 2: "Foo bar baz." -> 3 tokens
        // avg = 2.5
        assert!((m.avg_sentence_length - 2.5).abs() < 1e-9);
        // variance = ((2-2.5)^2 + (3-2.5)^2) / 2 = (0.25 + 0.25) / 2 = 0.25
        assert!((m.sentence_length_variance - 0.25).abs() < 1e-9);
    }

    #[test]
    fn test_sentence_metrics_empty() {
        let m = compute_sentence_metrics("");
        assert_eq!(m.sentence_count, 0);
        assert_eq!(m.avg_sentence_length, 0.0);
    }

    #[test]
    fn test_sentence_metrics_single() {
        let m = compute_sentence_metrics("Only one sentence.");
        assert_eq!(m.sentence_count, 1);
        assert_eq!(m.sentence_length_variance, 0.0);
    }
}
