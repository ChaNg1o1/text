/// Sentence-level metrics.
pub struct SentenceMetrics {
    pub sentence_count: usize,
    pub avg_sentence_length: f64,
    pub sentence_length_variance: f64,
}

#[inline(always)]
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}'
        | '\u{3400}'..='\u{4DBF}'
        | '\u{F900}'..='\u{FAFF}'
    )
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
                let end = i + c.len_utf8();
                let segment = &text[start..end];
                let trimmed = segment.trim();
                if !trimmed.is_empty() {
                    sentences.push(trimmed);
                }
            }
            start = i + c.len_utf8();
            prev_was_terminator = true;
        } else {
            prev_was_terminator = false;
        }
    }

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
    if text.is_empty() {
        return SentenceMetrics {
            sentence_count: 0,
            avg_sentence_length: 0.0,
            sentence_length_variance: 0.0,
        };
    }

    let mut sentence_count = 0usize;
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut current_tokens = 0usize;
    let mut in_word = false;
    let mut prev_was_terminator = false;

    for c in text.chars() {
        if is_cjk(c) {
            if in_word {
                current_tokens += 1;
                in_word = false;
            }
            current_tokens += 1;
        } else if c.is_alphanumeric() || c == '\'' || c == '\u{2019}' {
            in_word = true;
        } else if in_word {
            current_tokens += 1;
            in_word = false;
        }

        let is_terminator = matches!(c, '.' | '!' | '?' | '。' | '！' | '？');
        if is_terminator {
            if in_word {
                current_tokens += 1;
                in_word = false;
            }

            if !prev_was_terminator && current_tokens > 0 {
                let len = current_tokens as f64;
                sentence_count += 1;
                sum += len;
                sum_sq += len * len;
                current_tokens = 0;
            }
            prev_was_terminator = true;
        } else {
            prev_was_terminator = false;
        }
    }

    if in_word {
        current_tokens += 1;
    }
    if current_tokens > 0 {
        let len = current_tokens as f64;
        sentence_count += 1;
        sum += len;
        sum_sq += len * len;
    }

    if sentence_count == 0 {
        return SentenceMetrics {
            sentence_count: 0,
            avg_sentence_length: 0.0,
            sentence_length_variance: 0.0,
        };
    }

    let n = sentence_count as f64;
    let avg = sum / n;
    let variance = if sentence_count > 1 {
        (sum_sq / n) - (avg * avg)
    } else {
        0.0
    };

    SentenceMetrics {
        sentence_count,
        avg_sentence_length: avg,
        sentence_length_variance: variance.max(0.0),
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
        assert!((m.avg_sentence_length - 2.5).abs() < 1e-9);
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
