use rustc_hash::FxHashMap;
use std::collections::HashMap;
use unicode_segmentation::UnicodeSegmentation;

/// Check if a character belongs to the CJK Unified Ideographs block.
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}'   // CJK Unified Ideographs
        | '\u{3400}'..='\u{4DBF}' // CJK Unified Ideographs Extension A
        | '\u{F900}'..='\u{FAFF}' // CJK Compatibility Ideographs
    )
}

/// Extract character n-grams from text and return normalized frequencies.
///
/// For Latin text, character n-grams slide over the raw characters (ignoring whitespace runs).
/// For CJK text, each character is a meaningful unit, so n-grams capture character co-occurrence.
pub fn char_ngrams(text: &str, n: usize) -> HashMap<String, f64> {
    if n == 0 || text.is_empty() {
        return HashMap::new();
    }

    let mut counts: FxHashMap<String, u64> = FxHashMap::default();
    let mut total: u64 = 0;

    // Collect non-whitespace characters for sliding window.
    let chars: Vec<char> = text
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();

    if chars.len() < n {
        return HashMap::new();
    }

    for window in chars.windows(n) {
        let gram: String = window.iter().collect();
        *counts.entry(gram).or_insert(0) += 1;
        total += 1;
    }

    if total == 0 {
        return HashMap::new();
    }

    let total_f = total as f64;
    counts
        .into_iter()
        .map(|(k, v)| (k, v as f64 / total_f))
        .collect()
}

/// Extract word n-grams from text and return normalized frequencies.
///
/// Tokenization is Unicode-aware: Latin words are split on whitespace/punctuation,
/// and each CJK character is treated as an individual "word" token.
pub fn word_ngrams(text: &str, n: usize) -> HashMap<String, f64> {
    if n == 0 || text.is_empty() {
        return HashMap::new();
    }

    let tokens = tokenize_for_ngrams(text);
    if tokens.len() < n {
        return HashMap::new();
    }

    let mut counts: FxHashMap<String, u64> = FxHashMap::default();
    let mut total: u64 = 0;

    for window in tokens.windows(n) {
        let gram = window.join(" ");
        *counts.entry(gram).or_insert(0) += 1;
        total += 1;
    }

    if total == 0 {
        return HashMap::new();
    }

    let total_f = total as f64;
    counts
        .into_iter()
        .map(|(k, v)| (k, v as f64 / total_f))
        .collect()
}

/// Combined extraction for the feature struct: character bigrams + trigrams, word bigrams + trigrams.
/// Returns (char_ngrams_map, word_ngrams_map).
pub fn extract_all_ngrams(text: &str) -> (HashMap<String, f64>, HashMap<String, f64>) {
    let mut char_map: HashMap<String, f64> = HashMap::new();
    let mut word_map: HashMap<String, f64> = HashMap::new();

    // Merge character bigrams and trigrams.
    for n in [2, 3] {
        for (k, v) in char_ngrams(text, n) {
            // Prefix with the n-gram order to avoid collisions between bigram "ab" and trigram "ab".
            let key = format!("c{}:{}", n, k);
            char_map.insert(key, v);
        }
    }

    // Merge word bigrams and trigrams.
    for n in [2, 3] {
        for (k, v) in word_ngrams(text, n) {
            let key = format!("w{}:{}", n, k);
            word_map.insert(key, v);
        }
    }

    (char_map, word_map)
}

/// Tokenize text for word-level n-grams.
/// Latin words are extracted via Unicode word segmentation, lowercased.
/// Each CJK character is emitted as its own token.
fn tokenize_for_ngrams(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();

    for word in text.unicode_words() {
        let mut current_latin = String::new();
        for c in word.chars() {
            if is_cjk(c) {
                // Flush any accumulated Latin chars as one token.
                if !current_latin.is_empty() {
                    tokens.push(current_latin.to_lowercase());
                    current_latin.clear();
                }
                tokens.push(c.to_string());
            } else {
                current_latin.push(c);
            }
        }
        if !current_latin.is_empty() {
            tokens.push(current_latin.to_lowercase());
        }
    }

    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_char_bigrams_simple() {
        let result = char_ngrams("abc", 2);
        assert_eq!(result.len(), 2);
        assert!((result["ab"] - 0.5).abs() < 1e-9);
        assert!((result["bc"] - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_char_ngrams_cjk() {
        let result = char_ngrams("你好世界", 2);
        // 3 bigrams: 你好, 好世, 世界
        assert_eq!(result.len(), 3);
        for v in result.values() {
            assert!((v - 1.0 / 3.0).abs() < 1e-9);
        }
    }

    #[test]
    fn test_word_bigrams() {
        let result = word_ngrams("hello world foo", 2);
        assert_eq!(result.len(), 2);
        assert!(result.contains_key("hello world"));
        assert!(result.contains_key("world foo"));
    }

    #[test]
    fn test_word_ngrams_cjk_chars_are_tokens() {
        let result = word_ngrams("你好世界", 2);
        // CJK chars are individual tokens: 你, 好, 世, 界 -> 3 bigrams
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn test_empty_input() {
        assert!(char_ngrams("", 2).is_empty());
        assert!(word_ngrams("", 2).is_empty());
    }

    #[test]
    fn test_n_larger_than_input() {
        assert!(char_ngrams("ab", 5).is_empty());
        assert!(word_ngrams("hello", 3).is_empty());
    }
}
