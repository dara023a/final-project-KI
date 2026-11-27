// =============================================================
// utils/incidents.js — Penyimpanan insiden keamanan
// =============================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INCIDENTS_FILE = path.join(DATA_DIR, 'incidents.json');
const MAX_INCIDENTS = Number(config.INCIDENT_MAX || 500);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadIncidents() {
  ensureDataDir();
  if (!fs.existsSync(INCIDENTS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('[Incidents] File insiden korup, direset.');
    return [];
  }
}

function saveIncidents(incidents) {
  ensureDataDir();
  fs.writeFileSync(
    INCIDENTS_FILE,
    JSON.stringify(incidents.slice(0, MAX_INCIDENTS), null, 2),
    'utf8'
  );
}

function appendIncident(incident) {
  const incidents = loadIncidents();
  const now = new Date();
  const entry = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now.toISOString(),
    timestampMs: now.getTime(),
    category: incident.category || 'unknown',
    severity: incident.severity || 'low',
    score: Number(incident.score) || 0,
    confidence: Number(incident.confidence) || 0,
    source: incident.source || 'unknown',
    action: incident.action || 'log',
    groupId: incident.groupId || '',
    groupName: incident.groupName || '',
    senderId: incident.senderId || '',
    senderName: incident.senderName || '',
    indicators: Array.isArray(incident.indicators) ? incident.indicators.slice(0, 10) : [],
    text: String(incident.text || '').slice(0, 500),
    warningCount: Number(incident.warningCount) || 0,
  };

  incidents.unshift(entry);
  saveIncidents(incidents);
  return entry;
}

function getIncidentStats() {
  const incidents = loadIncidents();
  const byCategory = { spam: 0, phishing: 0, social_engineering: 0 };
  const bySeverity = { low: 0, medium: 0, high: 0 };
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let last24h = 0;

  for (const incident of incidents) {
    if (byCategory[incident.category] !== undefined) byCategory[incident.category]++;
    if (bySeverity[incident.severity] !== undefined) bySeverity[incident.severity]++;
    if (Number(incident.timestampMs) >= since) last24h++;
  }

  return {
    total: incidents.length,
    last24h,
    byCategory,
    bySeverity,
    recent: incidents.slice(0, 20),
  };
}

module.exports = {
  loadIncidents,
  appendIncident,
  getIncidentStats,
};
