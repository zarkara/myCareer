'use strict';
/**
 * myCareer corpus library. No dependencies.
 *
 * Loads a corpus, indexes it, computes regulatory adjacency from shared evidence
 * clusters, and filters claims for a render target. See docs/mycareer.md.
 */
const fs = require('fs');
const path = require('path');

const COLLECTIONS = ['orgs', 'roles', 'systems', 'claims', 'figures', 'stories',
  'regimes', 'evidence', 'attestations', 'records', 'rejections', 'open_questions',
  'disclosure_limits', 'sessions'];

const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4'];
const tierRank = t => TIER_ORDER.indexOf(t);

function load(file) {
  const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const c of COLLECTIONS) if (!corpus[c]) corpus[c] = [];
  return corpus;
}

function loadAdjacency(file) {
  const p = file || path.join(__dirname, '..', 'data', 'adjacency.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** id -> entity, across every collection. Ids are globally unique by design. */
function index(corpus) {
  const byId = new Map();
  for (const c of COLLECTIONS) for (const e of corpus[c]) if (e && e.id) byId.set(e.id, { ...e, _collection: c });
  return byId;
}

/**
 * Regimes that share evidence clusters with the ones already confirmed.
 * This is the Phase 2B memory unlock, computed rather than generated: one access-review
 * program feeds SOC 2, ISO 27001, HIPAA and HITRUST, so confirming any one of them makes
 * the others candidates worth triaging.
 */
function adjacentRegimes(confirmedIds, adjacency, { minShared = 3, limit = 8 } = {}) {
  const all = adjacency.regimes;
  const known = new Set(confirmedIds);
  const anchors = all.filter(r => known.has(r.id));
  if (!anchors.length) return [];
  const anchorClusters = new Set(anchors.flatMap(r => r.clusters || []));

  return all
    .filter(r => !known.has(r.id))
    .map(r => {
      const shared = (r.clusters || []).filter(c => anchorClusters.has(c));
      return {
        id: r.id,
        name: r.name,
        shared_clusters: shared,
        why: r.why,
        observable: r.observable,
        role_signals: r.role_signals || [],
        silent_form: r.silent_form,
        anchors: anchors.filter(a => (a.clusters || []).some(c => shared.includes(c))).map(a => a.name),
      };
    })
    .filter(r => r.shared_clusters.length >= minShared)
    .sort((a, b) => b.shared_clusters.length - a.shared_clusters.length)
    .slice(0, limit);
}

/**
 * Regimes implied by what the subject described in Phase 1, derived mechanically from
 * system and org attributes. Output is candidates, never facts.
 */
function triggeredRegimes(system, adjacency, orgAttributes = []) {
  const t = adjacency.trigger_conditions;
  const hits = new Map(); // regime id -> reasons
  const add = (ids, reason) => (ids || []).forEach(id => {
    if (!hits.has(id)) hits.set(id, []);
    hits.get(id).push(reason);
  });

  for (const dc of system.data_classes || []) add(t.data_classes[dc], `data class: ${dc}`);
  for (const bt of system.buyer_types || []) add(t.buyer_types[bt], `buyer: ${bt}`);
  if (system.deployment) add(t.deployment[system.deployment], `deployment: ${system.deployment}`);
  if (system.money_movement) {
    const key = String(system.money_movement).toLowerCase();
    for (const k of Object.keys(t.money_movement)) if (key.includes(k)) add(t.money_movement[k], `money movement: ${k}`);
    add(t.money_movement.any, 'money movement');
  }
  for (const a of orgAttributes) add(t.org_attributes[a], `org: ${a}`);

  const byId = new Map(adjacency.regimes.map(r => [r.id, r]));
  return [...hits.entries()]
    .map(([id, reasons]) => ({ ...(byId.get(id) || { id, name: id }), triggered_by: reasons }))
    .sort((a, b) => b.triggered_by.length - a.triggered_by.length);
}

/** The minimum tier across rendered fact types. A claim is only as verified as its weakest part. */
function effectiveTier(verification) {
  if (!verification) return 'T0';
  const per = Object.values(verification.by_fact_type || {});
  if (!per.length) return verification.tier || 'T0';
  return per.reduce((lo, t) => (tierRank(t) < tierRank(lo) ? t : lo), per[0]);
}

/**
 * Claims eligible for a render target, ranked. Enforces the two rules that keep output honest:
 * only confirmed claims render, and suppression for the target always wins.
 */
function selectForTarget(corpus, targetKey, { minTier = 'T1' } = {}) {
  const target = (corpus.positioning?.targets || []).find(t => t.key === targetKey);
  if (!target) throw new Error(`unknown positioning target: ${targetKey}`);
  const suppressed = new Set(target.suppress || []);
  const carries = new Set(target.carries || []);

  return corpus.claims
    .filter(c => c.status === 'confirmed')
    .filter(c => !suppressed.has(c.id))
    .filter(c => !(c.suppress_for || []).includes(targetKey))
    .filter(c => !target.job_family || !c.job_families?.length || c.job_families.includes(target.job_family))
    .filter(c => tierRank(effectiveTier(c.verification)) >= tierRank(minTier))
    .sort((a, b) => {
      if (carries.has(a.id) !== carries.has(b.id)) return carries.has(a.id) ? -1 : 1;
      const t = tierRank(effectiveTier(b.verification)) - tierRank(effectiveTier(a.verification));
      if (t) return t;
      return (b.figure_ids?.length || 0) - (a.figure_ids?.length || 0);
    });
}

/** Headline figures: the 4 to 6 numbers that carry the story, sourceable only. */
function headlineFigures(corpus, claims) {
  const allowed = new Set(claims.flatMap(c => c.figure_ids || []));
  return corpus.figures
    .filter(f => f.headline && f.sourceable && allowed.has(f.id))
    .slice(0, 6);
}

/** Text that must never appear in any render, from the persistent DO-NOT-CLAIM list. */
function forbiddenText(corpus) {
  return corpus.rejections.map(r => r.text);
}

module.exports = {
  COLLECTIONS, TIER_ORDER, tierRank, load, loadAdjacency, index,
  adjacentRegimes, triggeredRegimes, effectiveTier, selectForTarget,
  headlineFigures, forbiddenText,
};
