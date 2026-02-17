use pyo3::prelude::*;
use pyo3::types::PyDict;
use rayon::prelude::*;
use std::collections::HashMap;

mod lexical;
mod ngram;
mod syntactic;
mod unicode;

// ---------------------------------------------------------------------------
// PyO3 data classes
// ---------------------------------------------------------------------------

/// Feature vector extracted from a single text sample.
/// Maps 1:1 to the Python `RustFeatures` Pydantic model.
#[pyclass(get_all)]
#[derive(Clone, Debug)]
pub struct RustFeatures {
    pub token_count: usize,
    pub type_token_ratio: f64,
    pub hapax_legomena_ratio: f64,
    pub yules_k: f64,
    pub avg_word_length: f64,
    pub avg_sentence_length: f64,
    pub sentence_length_variance: f64,
    pub char_ngrams: HashMap<String, f64>,
    pub word_ngrams: HashMap<String, f64>,
    pub punctuation_profile: HashMap<String, f64>,
    pub function_word_freq: HashMap<String, f64>,
    pub cjk_ratio: f64,
    pub emoji_density: f64,
    pub formality_score: f64,
    pub code_switching_ratio: f64,
}

#[pymethods]
impl RustFeatures {
    fn __repr__(&self) -> String {
        format!(
            "RustFeatures(tokens={}, ttr={:.4}, hapax={:.4}, yules_k={:.2}, avg_wl={:.2}, \
             avg_sl={:.2}, sl_var={:.2}, cjk={:.4}, emoji={:.4}, formality={:.4}, \
             code_switch={:.4})",
            self.token_count,
            self.type_token_ratio,
            self.hapax_legomena_ratio,
            self.yules_k,
            self.avg_word_length,
            self.avg_sentence_length,
            self.sentence_length_variance,
            self.cjk_ratio,
            self.emoji_density,
            self.formality_score,
            self.code_switching_ratio,
        )
    }

    /// Convert to a flat Python dict (useful for DataFrame construction).
    fn to_dict<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyDict>> {
        let dict = PyDict::new(py);
        dict.set_item("token_count", self.token_count)?;
        dict.set_item("type_token_ratio", self.type_token_ratio)?;
        dict.set_item("hapax_legomena_ratio", self.hapax_legomena_ratio)?;
        dict.set_item("yules_k", self.yules_k)?;
        dict.set_item("avg_word_length", self.avg_word_length)?;
        dict.set_item("avg_sentence_length", self.avg_sentence_length)?;
        dict.set_item("sentence_length_variance", self.sentence_length_variance)?;
        dict.set_item("char_ngrams", self.char_ngrams.clone())?;
        dict.set_item("word_ngrams", self.word_ngrams.clone())?;
        dict.set_item("punctuation_profile", self.punctuation_profile.clone())?;
        dict.set_item("function_word_freq", self.function_word_freq.clone())?;
        dict.set_item("cjk_ratio", self.cjk_ratio)?;
        dict.set_item("emoji_density", self.emoji_density)?;
        dict.set_item("formality_score", self.formality_score)?;
        dict.set_item("code_switching_ratio", self.code_switching_ratio)?;
        Ok(dict)
    }
}

/// Lexical richness metrics returned by `lexical_richness`.
#[pyclass(get_all)]
#[derive(Clone, Debug)]
pub struct LexicalMetrics {
    pub token_count: usize,
    pub type_token_ratio: f64,
    pub hapax_legomena_ratio: f64,
    pub yules_k: f64,
    pub avg_word_length: f64,
}

/// Unicode profile metrics returned by `unicode_profile`.
#[pyclass(get_all)]
#[derive(Clone, Debug)]
pub struct UnicodeMetrics {
    pub cjk_ratio: f64,
    pub emoji_density: f64,
    pub code_switching_ratio: f64,
    pub formality_score: f64,
}

/// Sentence-level metrics returned by `sentence_stats`.
#[pyclass(get_all)]
#[derive(Clone, Debug)]
pub struct SentenceMetrics {
    pub sentence_count: usize,
    pub avg_sentence_length: f64,
    pub sentence_length_variance: f64,
}

// ---------------------------------------------------------------------------
// Core extraction logic (not PyO3-specific)
// ---------------------------------------------------------------------------

/// Extract all features from a single text into a `RustFeatures` struct.
fn extract_features(text: &str) -> RustFeatures {
    let lex = lexical::compute_lexical_metrics(text);
    let sent = syntactic::compute_sentence_metrics(text);
    let uni = unicode::compute_unicode_metrics(text);
    let (char_ng, word_ng) = ngram::extract_all_ngrams(text);
    let punct = unicode::punctuation_profile(text);
    let func_words = lexical::function_word_frequencies(text);

    RustFeatures {
        token_count: lex.token_count,
        type_token_ratio: lex.type_token_ratio,
        hapax_legomena_ratio: lex.hapax_legomena_ratio,
        yules_k: lex.yules_k,
        avg_word_length: lex.avg_word_length,
        avg_sentence_length: sent.avg_sentence_length,
        sentence_length_variance: sent.sentence_length_variance,
        char_ngrams: char_ng,
        word_ngrams: word_ng,
        punctuation_profile: punct,
        function_word_freq: func_words,
        cjk_ratio: uni.cjk_ratio,
        emoji_density: uni.emoji_density,
        formality_score: uni.formality_score,
        code_switching_ratio: uni.code_switching_ratio,
    }
}

// ---------------------------------------------------------------------------
// PyO3-exposed functions
// ---------------------------------------------------------------------------

/// Extract features from multiple texts in parallel using rayon.
#[pyfunction]
fn batch_extract(texts: Vec<String>) -> Vec<RustFeatures> {
    texts.par_iter().map(|t| extract_features(t)).collect()
}

/// Extract character and word n-grams with normalized frequencies.
///
/// Returns a merged map with prefixed keys:
///   - `c2:xx`, `c3:xxx` for character 2-grams and 3-grams
///   - `w2:x y`, `w3:x y z` for word 2-grams and 3-grams
///
/// Pass `n` to control the maximum n-gram order (e.g. n=2 gives only bigrams,
/// n=3 gives bigrams + trigrams).
#[pyfunction]
fn extract_ngrams(text: &str, n: usize) -> HashMap<String, f64> {
    let mut result = HashMap::new();

    for order in 2..=n {
        for (k, v) in ngram::char_ngrams(text, order) {
            result.insert(format!("c{}:{}", order, k), v);
        }
        for (k, v) in ngram::word_ngrams(text, order) {
            result.insert(format!("w{}:{}", order, k), v);
        }
    }

    result
}

/// Compute lexical richness metrics: TTR, hapax ratio, Yule's K, avg word length.
#[pyfunction]
fn lexical_richness(text: &str) -> LexicalMetrics {
    let m = lexical::compute_lexical_metrics(text);
    LexicalMetrics {
        token_count: m.token_count,
        type_token_ratio: m.type_token_ratio,
        hapax_legomena_ratio: m.hapax_legomena_ratio,
        yules_k: m.yules_k,
        avg_word_length: m.avg_word_length,
    }
}

/// Compute Unicode profile: CJK ratio, emoji density, code-switching ratio, formality score.
#[pyfunction]
fn unicode_profile(text: &str) -> UnicodeMetrics {
    let m = unicode::compute_unicode_metrics(text);
    UnicodeMetrics {
        cjk_ratio: m.cjk_ratio,
        emoji_density: m.emoji_density,
        code_switching_ratio: m.code_switching_ratio,
        formality_score: m.formality_score,
    }
}

/// Compute punctuation character frequencies.
#[pyfunction]
fn punctuation_profile(text: &str) -> HashMap<String, f64> {
    unicode::punctuation_profile(text)
}

/// Compute sentence-level statistics: count, average length, variance.
#[pyfunction]
fn sentence_stats(text: &str) -> SentenceMetrics {
    let m = syntactic::compute_sentence_metrics(text);
    SentenceMetrics {
        sentence_count: m.sentence_count,
        avg_sentence_length: m.avg_sentence_length,
        sentence_length_variance: m.sentence_length_variance,
    }
}

// ---------------------------------------------------------------------------
// Module registration
// ---------------------------------------------------------------------------

/// Python module entry point for `tf_features`.
#[pymodule]
fn _tf_features(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<RustFeatures>()?;
    m.add_class::<LexicalMetrics>()?;
    m.add_class::<UnicodeMetrics>()?;
    m.add_class::<SentenceMetrics>()?;
    m.add_function(wrap_pyfunction!(batch_extract, m)?)?;
    m.add_function(wrap_pyfunction!(extract_ngrams, m)?)?;
    m.add_function(wrap_pyfunction!(lexical_richness, m)?)?;
    m.add_function(wrap_pyfunction!(unicode_profile, m)?)?;
    m.add_function(wrap_pyfunction!(punctuation_profile, m)?)?;
    m.add_function(wrap_pyfunction!(sentence_stats, m)?)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Rust-level tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_features_english() {
        let f = extract_features("The quick brown fox jumps over the lazy dog. The dog barked!");
        assert!(f.token_count > 0);
        assert!(f.type_token_ratio > 0.0);
        assert!(f.avg_sentence_length > 0.0);
        assert_eq!(f.cjk_ratio, 0.0);
    }

    #[test]
    fn test_extract_features_cjk() {
        let f = extract_features("你好世界。今天天气不错！");
        assert!(f.token_count > 0);
        assert!(f.cjk_ratio > 0.5);
        assert!(f.avg_sentence_length > 0.0);
    }

    #[test]
    fn test_extract_features_mixed() {
        let f = extract_features("Hello你好World世界. Mixed text here.");
        assert!(f.token_count > 0);
        assert!(f.cjk_ratio > 0.0);
        assert!(f.code_switching_ratio > 0.0);
    }

    #[test]
    fn test_extract_features_empty() {
        let f = extract_features("");
        assert_eq!(f.token_count, 0);
        assert_eq!(f.type_token_ratio, 0.0);
        assert_eq!(f.cjk_ratio, 0.0);
    }

    #[test]
    fn test_batch_extract_parallel() {
        let texts = vec![
            "First document with some text.".to_string(),
            "Second document: different words here.".to_string(),
            "你好世界。中文文本。".to_string(),
            "Mixed 中英文 document here.".to_string(),
        ];
        let results = batch_extract(texts);
        assert_eq!(results.len(), 4);
        assert!(results[2].cjk_ratio > 0.5);
        assert!(results[3].code_switching_ratio > 0.0);
    }

    #[test]
    fn test_extract_ngrams_function() {
        let result = extract_ngrams("Hello world foo", 3);
        // Should have c2, c3, w2, w3 entries.
        assert!(result.keys().any(|k| k.starts_with("c2:")));
        assert!(result.keys().any(|k| k.starts_with("c3:")));
        assert!(result.keys().any(|k| k.starts_with("w2:")));
        assert!(result.keys().any(|k| k.starts_with("w3:")));
    }

    #[test]
    fn test_function_word_freq_in_features() {
        let f = extract_features("I am the one who is not here.");
        // "i", "am", "the", "who", "is", "not", "here" — several are function words.
        assert!(f.function_word_freq.contains_key("the"));
        assert!(f.function_word_freq.contains_key("is"));
        assert!(f.function_word_freq.contains_key("not"));
    }
}
