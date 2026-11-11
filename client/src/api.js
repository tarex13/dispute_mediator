
async function request(path, options = {}) {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server.' } };
  }
}

const enc = encodeURIComponent;

export const loadDisputes = () => request('/api/disputesLoad');

export const saveContext = (id, context) =>
  request(`/api/disputes/${enc(id)}/context`, { method: 'POST', body: JSON.stringify(context) });

export const getRecommendation = (id, followUpAnswers) =>
  request(`/api/disputes/${enc(id)}/recommend`, {
    method: 'POST',
    body: JSON.stringify(followUpAnswers ? { followUpAnswers } : {}),
  });

export const approve = (id, recommendation, edits) =>
  request(`/api/disputes/${enc(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ recommendation, edits }),
  });