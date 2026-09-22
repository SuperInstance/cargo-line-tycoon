/**
 * safe_envelope.js — Memory Sandbox for the Quilt substrate.
 *
 * Implements a Leong-style authority boundary (cf. arXiv 2605.08442):
 *   - Consumers (LLM agents) see ONLY the typed envelope of an observation.
 *   - The raw payload.text is NEVER directly accessible to the consumer.
 *   - The consumer must pass through safe_envelope(obs, consumer_authority)
 *     which returns {op, source, timestamp, hash, authority_check_passed}.
 * 
 * This is the substrate's *execution-layer* defense. Combined with the
 * substrate's *storage-layer* witness-log (which is the candor-WAL pattern),
 * we now have a defense at both layers.
 */

const fs = require('fs');
const path = require('path');

// Authority classes for consumers
const AuthorityClass = {
  DIRECTOR:    'director',     // can see all observations, but only summary
  AGENT:       'agent',        // can see observations in their agent room
  STUDENT:     'student',      // can see only their own observations (echoed)
  AUDITOR:     'auditor',      // can see everything (for the substrate's immune system)
  REJECTED:    'rejected',     // no authority
};

// What each authority class is allowed to see
const AUTHORITY_SCOPES = {
  [AuthorityClass.DIRECTOR]: { 
    fields: ['op', 'source', 'timestamp', 'hash', 'target', 'signal_type'],
    can_see_payload: false,
    can_see_text: false,
  },
  [AuthorityClass.AGENT]: {
    fields: ['op', 'source', 'timestamp', 'hash'],
    can_see_payload: false,
    can_see_text: false,
  },
  [AuthorityClass.STUDENT]: {
    fields: ['hash', 'timestamp'],
    can_see_payload: false,
    can_see_text: false,
  },
  [AuthorityClass.AUDITOR]: {
    fields: ['*'],
    can_see_payload: true,
    can_see_text: true,
  },
  [AuthorityClass.REJECTED]: {
    fields: [],
    can_see_payload: false,
    can_see_text: false,
  },
};

/**
 * Produce a safe envelope for a consumer.
 * 
 * @param {Object} obs - The observation (a Signal instance or raw envelope)
 * @param {string} authority - One of AuthorityClass
 * @returns {Object} - {safe_envelope, authority_passed, denied_fields}
 * 
 * The safe_envelope is what the consumer should treat as its input.
 * The denied_fields list tells the consumer what it cannot see.
 */
function safe_envelope(obs, authority) {
  const scope = AUTHORITY_SCOPES[authority] || AUTHORITY_SCOPES[AuthorityClass.REJECTED];
  
  if (scope.fields[0] === '*') {
    // auditor sees everything
    return {
      safe_envelope: {
        op: obs.op || obs.signal_type,
        source: obs.source,
        target: obs.target,
        timestamp: obs.timestamp,
        hash: obs.hash || obs.id,
        signal_type: obs.signal_type,
        payload: obs.payload,  // auditor only
      },
      authority_passed: true,
      authority: 'auditor',
      denied_fields: [],
    };
  }
  
  const envelope = {};
  for (const field of scope.fields) {
    if (obs[field] !== undefined) envelope[field] = obs[field];
  }
  
  return {
    safe_envelope: envelope,
    authority_passed: authority !== AuthorityClass.REJECTED,
    authority,
    denied_fields: scope.fields[0] === '*' 
      ? [] 
      : ['payload', 'payload.text', 'payload.target_state'].filter(f => !scope.fields.includes(f)),
    note: 'Memory-Sandbox: payload.text and other agent-readable fields are NOT exposed',
  };
}

/**
 * Detect potential prompt-injection in payload.text BEFORE storing.
 * Returns {safe_to_store, flags, sanitized_text}
 * 
 * Heuristic flags:
 *   - IGNORE_ALL_PREVIOUS
 *   - SYSTEM: prefix
 *   - <system> tags
 *   - LATER/WHEN/IF (delayed-trigger patterns)
 */
function detect_injection(text) {
  if (typeof text !== 'string') return { safe_to_store: true, flags: [] };
  const flags = [];
  
  const patterns = [
    { name: 'IGNORE_PREVIOUS', regex: /IGNORE\s+(ALL\s+)?PREVIOUS/i },
    { name: 'SYSTEM_PREFIX',   regex: /^SYSTEM\s*:/i },
    { name: 'SYSTEM_TAG',      regex: /<\/?system>/i },
    { name: 'DELAYED_TRIGGER', regex: /\b(LATER|AFTER|YESTERDAY|IN\s+\d+\s+DAYS|IF\s+YOU\s+ARE)\b/i },
    { name: 'ROLE_HIJACK',     regex: /\b(you\s+are\s+now|new\s+role|pretend\s+to\s+be)\b/i },
    { name: 'PROMPT_LEAK',     regex: /\b(reveal\s+your\s+system|show\s+your\s+prompt)\b/i },
  ];
  
  for (const p of patterns) {
    if (p.regex.test(text)) flags.push(p.name);
  }
  
  return {
    safe_to_store: flags.length === 0,
    flags,
    sanitized_text: flags.length === 0 ? text : null,
  };
}

/**
 * The high-level API: store_or_reject(observation, caller_authority).
 * Returns {stored, reason, sandboxed_observation}
 */
function store_or_reject(observation, caller_authority) {
  // 1. Check caller authority (default: rejected if unknown)
  if (!AUTHORITY_SCOPES[caller_authority]) {
    return { stored: false, reason: 'unknown_authority' };
  }
  
  // 2. Inspect any text fields for injection patterns
  const text_fields = ['payload.text', 'payload.message', 'payload.content'];
  for (const tf of text_fields) {
    const parts = tf.split('.');
    let v = observation;
    for (const p of parts) {
      if (!v || typeof v !== 'object') break;
      v = v[p];
    }
    if (typeof v === 'string') {
      const check = detect_injection(v);
      if (!check.safe_to_store) {
        return {
          stored: false,
          reason: 'injection_pattern_detected',
          flags: check.flags,
          // The substrate STILL records the rejection as a witness entry —
          // the rejection itself is auditable
          witness_entry: {
            op: 'INJECTION_REJECTED',
            payload: { text: v.slice(0, 100), flags: check.flags, caller_authority },
            timestamp: Date.now(),
          },
        };
      }
    }
  }
  
  return { stored: true, sandboxed_observation: observation };
}

/**
 * The consumer-side: consume(obs, consumer_authority).
 * Returns only the safe envelope — caller MUST NOT attempt to read payload.text.
 */
function consume(obs, consumer_authority) {
  return safe_envelope(obs, consumer_authority);
}

module.exports = {
  AuthorityClass,
  AUTHORITY_SCOPES,
  safe_envelope,
  detect_injection,
  store_or_reject,
  consume,
};
