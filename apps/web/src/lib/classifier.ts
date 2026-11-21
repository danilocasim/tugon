/**
 * TF-IDF (unigram + bigram, min_df = 2) with Multinomial Naive Bayes (α = 1.0),
 * mirroring the thesis configuration and scikit-learn defaults (smooth idf,
 * L2-normalised rows). Two independent models: category and urgency.
 */
import { CORPUS } from "./corpus";
import type { Category, Prediction, Urgency } from "./domain";

/** The 30 Taglish function words removed in Chapter 3. */
const STOPWORDS = new Set(
  "po ho ang ng sa na na_lang naman pa mga ko mo niya namin ninyo nila si kay at o ako ikaw kami tayo sila ito iyan iyon dito doon".split(" "),
);

function tokenize(text: string) {
  const words = text
    .toLowerCase()
    .replace(/http\S+|www\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const grams = [...words];
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]} ${words[i + 1]}`);
  return grams;
}

type Row = Map<number, number>;

class TfidfVectorizer {
  vocab = new Map<string, number>();
  idf: number[] = [];

  constructor(private minDf = 2) {}

  fit(docs: string[]) {
    const df = new Map<string, number>();
    for (const doc of docs) for (const g of new Set(tokenize(doc))) df.set(g, (df.get(g) ?? 0) + 1);
    const terms = [...df.entries()].filter(([, c]) => c >= this.minDf).map(([t]) => t).sort();
    terms.forEach((t, i) => this.vocab.set(t, i));
    this.idf = terms.map((t) => Math.log((1 + docs.length) / (1 + df.get(t)!)) + 1);
    return this;
  }

  transform(doc: string): Row {
    const row: Row = new Map();
    for (const g of tokenize(doc)) {
      const i = this.vocab.get(g);
      if (i !== undefined) row.set(i, (row.get(i) ?? 0) + 1);
    }
    let norm = 0;
    for (const [i, c] of row) {
      const w = c * this.idf[i];
      row.set(i, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [i, w] of row) row.set(i, w / norm);
    return row;
  }
}

class MultinomialNB<C extends string> {
  classes: C[] = [];
  logPrior = {} as Record<C, number>;
  logLik = {} as Record<C, Float64Array>;

  constructor(private alpha = 1.0) {}

  fit(rows: Row[], labels: C[], vocabSize: number) {
    this.classes = [...new Set(labels)].sort();
    for (const c of this.classes) {
      const feat = new Float64Array(vocabSize);
      let docs = 0;
      rows.forEach((row, k) => {
        if (labels[k] !== c) return;
        docs++;
        for (const [i, w] of row) feat[i] += w;
      });
      const denom = feat.reduce((a, b) => a + b, 0) + this.alpha * vocabSize;
      this.logPrior[c] = Math.log(docs / labels.length);
      this.logLik[c] = Float64Array.from(feat, (f) => Math.log((f + this.alpha) / denom));
    }
    return this;
  }

  /** Posterior probabilities via softmax of the joint log likelihood, best first. */
  rankedProba(row: Row) {
    const joint = this.classes.map((c) => {
      let s = this.logPrior[c];
      for (const [i, w] of row) s += w * this.logLik[c][i];
      return { label: c, s };
    });
    const max = Math.max(...joint.map((j) => j.s));
    const exps = joint.map((j) => ({ label: j.label, e: Math.exp(j.s - max) }));
    const z = exps.reduce((a, b) => a + b.e, 0);
    return exps.map((x) => ({ label: x.label, p: +(x.e / z).toFixed(3) })).sort((a, b) => b.p - a.p);
  }
}

function train<C extends string>(labels: C[]) {
  const texts = CORPUS.map((r) => r[0]);
  const vec = new TfidfVectorizer(2).fit(texts);
  const nb = new MultinomialNB<C>(1.0).fit(texts.map((t) => vec.transform(t)), labels, vec.vocab.size);
  return { vec, nb };
}

const catModel = train<Category>(CORPUS.map((r) => r[1]));
const urgModel = train<Urgency>(CORPUS.map((r) => r[2]));
const terms = [...catModel.vec.vocab.keys()];

/** Words too generic to show staff as evidence, even when they carry weight. */
const DISPLAY_SKIP = new Set("may yung purok para lang tanong kung din rin of the and kailangan nag bata".split(" "));

/** Terms in the request that pushed the predicted category up the most. */
function evidence(row: Row, label: Category) {
  const others = catModel.nb.classes.filter((c) => c !== label);
  return [...row.entries()]
    .map(([i, w]) => {
      const lik = catModel.nb.logLik;
      const lift = lik[label][i] - others.reduce((a, c) => a + lik[c][i], 0) / others.length;
      return { term: terms[i], score: w * lift };
    })
    .filter((e) => e.score > 0 && e.term.length > 2 && !e.term.split(" ").every((t) => DISPLAY_SKIP.has(t) || /^\d+$/.test(t)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((e) => e.term);
}

/** Suggest a category and urgency for staff review. Never decisive on its own. */
export function suggest(text: string): Prediction {
  const catRow = catModel.vec.transform(text);
  const category = catModel.nb.rankedProba(catRow);
  const urgency = urgModel.nb.rankedProba(urgModel.vec.transform(text));
  return {
    category: category[0].label,
    categoryP: category[0].p,
    categoryRanked: category,
    urgency: urgency[0].label,
    urgencyP: urgency[0].p,
    urgencyRanked: urgency,
    evidence: evidence(catRow, category[0].label),
  };
}

export const MODEL_CARD = {
  name: "TF-IDF + Multinomial Naive Bayes",
  trainedOn: CORPUS.length,
  vocab: catModel.vec.vocab.size,
  params: "unigrams + bigrams · min_df 2 · α 1.0 · 30 Taglish stopwords",
};
