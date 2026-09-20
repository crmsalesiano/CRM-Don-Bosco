// ============================================================
// Directorio Parroquial — lógica de la app
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.APP_CONFIG || {};
let sb = null;
if (cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith('PEGA_AQUI')) {
  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}

const content = document.getElementById('content');
let currentUser = null; // { id, nombre, email, rol }

// Capturamos esto ANTES de que Supabase procese y borre el hash de la URL.
// type=invite o type=recovery significa "esta persona necesita crear su
// contraseña", no un login normal.
const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
const authFlowType = hashParams.get('type');
const authFlowError = hashParams.get('error_description');

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
function avatarColor(name) {
  const colors = ['#2F5D50', '#C1694B', '#8A7B5C', '#4C6B8A', '#B08A3E'];
  let h = 0;
  for (const c of (name || '')) h += c.charCodeAt(0);
  return colors[h % colors.length];
}
function formatFecha(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function toast(msg) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
const iconPlus = () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const iconBack = () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
const iconPhone = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
const iconChat = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-1.9 5.4 8.5 8.5 0 0 1-6.6 3.1 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`;
const iconEdit = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

// ------------------------------------------------------------
// Acceso a datos (Supabase)
// ------------------------------------------------------------
async function fetchCategorias() {
  const { data, error } = await sb.from('categorias').select('*').order('nombre');
  if (error) { toast('Error: ' + error.message); return []; }
  return data;
}

async function fetchPersonas({ search, categoriaId } = {}) {
  const { data, error } = await sb
    .from('personas')
    .select('*, persona_categorias(categoria_id, categorias(nombre)), persona_habilidades_libres(id, habilidad)')
    .order('nombre');
  if (error) { toast('Error: ' + error.message); return []; }
  let rows = data;
  if (categoriaId) rows = rows.filter(p => p.persona_categorias.some(pc => pc.categoria_id === categoriaId));
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(p =>
      p.nombre.toLowerCase().includes(s) ||
      (p.notas || '').toLowerCase().includes(s) ||
      p.persona_categorias.some(pc => (pc.categorias?.nombre || '').toLowerCase().includes(s)) ||
      p.persona_habilidades_libres.some(h => h.habilidad.toLowerCase().includes(s))
    );
  }
  return rows;
}

async function fetchPersona(id) {
  const { data, error } = await sb
    .from('personas')
    .select('*, persona_categorias(categoria_id), persona_habilidades_libres(id, habilidad)')
    .eq('id', id).single();
  if (error) { toast('Error: ' + error.message); return null; }
  return data;
}

async function createPersona(payload) {
  const { data, error } = await sb.from('personas').insert({
    nombre: payload.nombre, telefono: payload.telefono, direccion: payload.direccion,
    grupo_ministerio: payload.grupo_ministerio, disponibilidad: payload.disponibilidad, notas: payload.notas
  }).select().single();
  if (error) { toast('Error guardando: ' + error.message); return null; }
  if (payload.categoriaIds.length) {
    await sb.from('persona_categorias').insert(payload.categoriaIds.map(cid => ({ persona_id: data.id, categoria_id: cid })));
  }
  if (payload.habilidadesLibres.length) {
    await sb.from('persona_habilidades_libres').insert(payload.habilidadesLibres.map(h => ({ persona_id: data.id, habilidad: h })));
  }
  return data;
}

async function updatePersona(id, payload) {
  const { error } = await sb.from('personas').update({
    nombre: payload.nombre, telefono: payload.telefono, direccion: payload.direccion,
    grupo_ministerio: payload.grupo_ministerio, disponibilidad: payload.disponibilidad, notas: payload.notas
  }).eq('id', id);
  if (error) { toast('Error actualizando: ' + error.message); return false; }
  await sb.from('persona_categorias').delete().eq('persona_id', id);
  if (payload.categoriaIds.length) {
    await sb.from('persona_categorias').insert(payload.categoriaIds.map(cid => ({ persona_id: id, categoria_id: cid })));
  }
  await sb.from('persona_habilidades_libres').delete().eq('persona_id', id);
  if (payload.habilidadesLibres.length) {
    await sb.from('persona_habilidades_libres').insert(payload.habilidadesLibres.map(h => ({ persona_id: id, habilidad: h })));
  }
  return true;
}

async function fetchGrupos() {
  const { data, error } = await sb.from('grupos').select('*, grupo_miembros(persona_id)').order('nombre');
  if (error) { toast('Error: ' + error.message); return []; }
  return data;
}
async function createGrupo(nombre, descripcion) {
  const { data, error } = await sb.from('grupos').insert({ nombre, descripcion }).select().single();
  if (error) { toast('Error: ' + error.message); return null; }
  return data;
}
async function fetchGrupoDetalle(id) {
  const { data: grupo, error } = await sb.from('grupos').select('*').eq('id', id).single();
  if (error) { toast('Error: ' + error.message); return null; }
  const { data: miembros } = await sb.from('grupo_miembros').select('persona_id, personas(id, nombre, telefono)').eq('grupo_id', id);
  return { grupo, miembros: miembros || [] };
}
async function addMiembroAGrupo(grupoId, personaId) {
  const { error } = await sb.from('grupo_miembros').insert({ grupo_id: grupoId, persona_id: personaId });
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}
async function quitarMiembroDeGrupo(grupoId, personaId) {
  const { error } = await sb.from('grupo_miembros').delete().eq('grupo_id', grupoId).eq('persona_id', personaId);
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}

async function fetchEventos() {
  const { data, error } = await sb.from('eventos').select('*').order('fecha').order('hora');
  if (error) { toast('Error: ' + error.message); return []; }
  return data;
}
async function createEvento(payload) {
  const { error } = await sb.from('eventos').insert(payload);
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}

async function fetchSacramentos(tipo) {
  const { data, error } = await sb.from('sacramentos').select('*').order('fecha', { ascending: false });
  if (error) { toast('Error: ' + error.message); return []; }
  return (tipo && tipo !== 'Todos') ? data.filter(s => s.tipo === tipo) : data;
}
async function createSacramento(payload) {
  const { error } = await sb.from('sacramentos').insert(payload);
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}

async function fetchAvisos() {
  const { data, error } = await sb.from('avisos').select('*').order('fecha_publicacion', { ascending: false });
  if (error) { toast('Error: ' + error.message); return []; }
  return data;
}
async function createAviso(payload) {
  const { error } = await sb.from('avisos').insert(payload);
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}

async function fetchMiPerfil(userId) {
  const { data, error } = await sb.from('perfiles').select('nombre, email, activo, roles(nombre)').eq('user_id', userId).single();
  if (error) return null;
  return data;
}
async function fetchUsuarios() {
  const { data, error } = await sb.from('perfiles').select('*, roles(nombre)').order('nombre');
  if (error) { toast('Error: ' + error.message); return []; }
  return data;
}
async function fetchRolesList() {
  const { data, error } = await sb.from('roles').select('*').order('nombre');
  if (error) { toast('Error: ' + error.message); return []; }
  return data;
}
async function actualizarRolUsuario(userId, rolId) {
  const { error } = await sb.from('perfiles').update({ rol_id: rolId }).eq('user_id', userId);
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}
async function actualizarActivoUsuario(userId, activo) {
  const { error } = await sb.from('perfiles').update({ activo }).eq('user_id', userId);
  if (error) { toast('Error: ' + error.message); return false; }
  return true;
}
async function crearUsuario({ email, nombre, rol }) {
  const { data, error } = await sb.functions.invoke('create-user', { body: { email, nombre, rol } });
  if (error) {
    let msg = error.message;
    try { const body = await error.context.json(); if (body?.error) msg = body.error; } catch (_) {}
    toast('Error: ' + msg);
    return false;
  }
  if (data?.error) { toast('Error: ' + data.error); return false; }
  return true;
}

// ------------------------------------------------------------
// Vistas
// ------------------------------------------------------------

async function renderMenu() {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const [personas, grupos, eventos, avisos] = await Promise.all([fetchPersonas(), fetchGrupos(), fetchEventos(), fetchAvisos()]);
  const hoy = new Date().toISOString().slice(0, 10);
  const proximos = eventos.filter(e => e.fecha >= hoy).length;
  content.innerHTML = `
    <div style="margin-bottom:30px;">
      <h1 class="display" style="font-size:34px;color:var(--accent);">Bienvenido</h1>
      <div class="view-subtitle">¿Qué necesita hacer hoy?</div>
    </div>
    <div class="menu-grid">
      <a class="menu-card" href="#/directorio"><div class="dot" style="background:var(--accent);"></div><div class="title">Directorio de talentos</div><div class="meta">${personas.length} persona${personas.length===1?'':'s'} registrada${personas.length===1?'':'s'}</div></a>
      <a class="menu-card" href="#/grupos"><div class="dot" style="background:var(--accent2);"></div><div class="title">Grupos y ministerios</div><div class="meta">${grupos.length} grupo${grupos.length===1?'':'s'} activo${grupos.length===1?'':'s'}</div></a>
      <a class="menu-card" href="#/calendario"><div class="dot" style="background:#8A7B5C;"></div><div class="title">Calendario</div><div class="meta">${proximos} evento${proximos===1?'':'s'} próximo${proximos===1?'':'s'}</div></a>
      <a class="menu-card" href="#/sacramentos"><div class="dot" style="background:#4C6B8A;"></div><div class="title">Sacramentos</div><div class="meta">Registro y consulta</div></a>
      <a class="menu-card" href="#/avisos"><div class="dot" style="background:#B08A3E;"></div><div class="title">Avisos y comunicados</div><div class="meta">${avisos.length} aviso${avisos.length===1?'':'s'}</div></a>
    </div>`;
}

let directorioState = { search: '', categoriaId: null };

async function renderDirectorio() {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const categorias = await fetchCategorias();
  const personas = await fetchPersonas({ search: directorioState.search, categoriaId: directorioState.categoriaId });
  content.innerHTML = `
    <div class="view-header">
      <div><div class="view-title">Directorio de talentos</div><div class="view-subtitle">Encuentra a alguien de la parroquia que pueda ayudar</div></div>
      <a class="btn btn-accent2" href="#/persona/nueva">${iconPlus()} Agregar persona</a>
    </div>
    <input id="buscador" type="text" placeholder="Buscar por oficio, nombre o habilidad..." value="${esc(directorioState.search)}"
      style="width:100%;height:52px;border:2px solid var(--border);border-radius:14px;padding:0 18px;outline:none;margin-bottom:16px;">
    <div class="gap-8" style="margin-bottom:20px;">
      <button class="pill ${!directorioState.categoriaId ? 'selected' : ''}" data-cat="">Todos</button>
      ${categorias.map(c => `<button class="pill ${directorioState.categoriaId === c.id ? 'selected' : ''}" data-cat="${c.id}">${esc(c.nombre)}</button>`).join('')}
    </div>
    <div class="section-label">${personas.length} persona${personas.length === 1 ? '' : 's'} encontrada${personas.length === 1 ? '' : 's'}</div>
    <div>${personas.length ? personas.map(personaRowHtml).join('') : `<div class="empty-state">No se encontró a nadie con esos datos.</div>`}</div>
  `;
  document.getElementById('buscador').addEventListener('input', debounce(e => {
    directorioState.search = e.target.value; renderDirectorio();
  }, 350));
  content.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => { directorioState.categoriaId = btn.dataset.cat || null; renderDirectorio(); });
  });
}

function personaRowHtml(p) {
  const cats = p.persona_categorias.map(pc => pc.categorias?.nombre).filter(Boolean);
  return `<a class="person-row" href="#/persona/${p.id}">
    <div class="avatar" style="background:${avatarColor(p.nombre)};">${initials(p.nombre)}</div>
    <div style="flex-grow:1;">
      <div style="font-size:19px;font-weight:700;">${esc(p.nombre)}</div>
      <div class="gap-8" style="margin-top:4px;">${cats.map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div>
    </div>
    <div class="muted">${esc(p.telefono || '')}</div>
  </a>`;
}

let formCategoriasSeleccionadas = new Set();
let formHabilidadesLibres = [];

async function renderPersonaForm(id) {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const categorias = await fetchCategorias();
  let persona = null;
  if (id) persona = await fetchPersona(id);
  formCategoriasSeleccionadas = new Set(persona ? persona.persona_categorias.map(pc => pc.categoria_id) : []);
  formHabilidadesLibres = persona ? persona.persona_habilidades_libres.map(h => ({ habilidad: h.habilidad })) : [];

  content.innerHTML = `
    <div class="back-row">
      <a class="icon-btn" href="#/${id ? ('persona/' + id) : 'directorio'}">${iconBack()}</a>
      <div class="view-title" style="font-size:26px;">${id ? 'Editar persona' : 'Agregar persona'}</div>
    </div>
    <form id="persona-form">
      <div class="field"><label>Nombre completo</label><input name="nombre" required value="${esc(persona?.nombre || '')}" placeholder="Ej. Carlos Alberto Pérez López"></div>
      <div class="field-row">
        <div class="field"><label>Teléfono</label><input name="telefono" value="${esc(persona?.telefono || '')}" placeholder="5555-1234"></div>
        <div class="field"><label>Dirección</label><input name="direccion" value="${esc(persona?.direccion || '')}" placeholder="Ej. Colonia La Esperanza, zona 3"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Grupo o ministerio</label><input name="grupo_ministerio" value="${esc(persona?.grupo_ministerio || '')}" placeholder="Ej. Coro, Catequesis"></div>
        <div class="field"><label>Disponibilidad</label><input name="disponibilidad" value="${esc(persona?.disponibilidad || '')}" placeholder="Ej. Fines de semana"></div>
      </div>
      <div class="field">
        <label>Oficios y habilidades</label>
        <div class="gap-8" id="categorias-pills" style="margin-bottom:12px;">
          ${categorias.map(c => `<button type="button" class="pill ${formCategoriasSeleccionadas.has(c.id) ? 'selected' : ''}" data-cat-toggle="${c.id}">${formCategoriasSeleccionadas.has(c.id) ? '✓ ' : ''}${esc(c.nombre)}</button>`).join('')}
        </div>
        <div class="gap-8" id="habilidades-libres-list" style="margin-bottom:10px;"></div>
        <div style="display:flex;gap:10px;">
          <input id="nueva-habilidad" placeholder="¿Sabe hacer algo más? Escríbelo aquí..." style="flex-grow:1;height:48px;border:2px solid var(--border);border-radius:12px;padding:0 16px;outline:none;">
          <button type="button" id="btn-add-habilidad" class="btn btn-accent2 btn-sm">Agregar</button>
        </div>
      </div>
      <div class="field"><label>Notas</label><textarea name="notas" placeholder="Ej. Ya ayudó reparando las bancas de la iglesia en 2024.">${esc(persona?.notas || '')}</textarea></div>
      <button type="submit" class="btn btn-primary btn-block" style="height:56px;font-size:18px;">Guardar persona</button>
    </form>
  `;

  content.querySelectorAll('[data-cat-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.catToggle;
      const cat = categorias.find(c => c.id === cid);
      if (formCategoriasSeleccionadas.has(cid)) formCategoriasSeleccionadas.delete(cid); else formCategoriasSeleccionadas.add(cid);
      btn.classList.toggle('selected');
      btn.textContent = (formCategoriasSeleccionadas.has(cid) ? '✓ ' : '') + cat.nombre;
    });
  });

  function renderHabilidadesLibresList() {
    document.getElementById('habilidades-libres-list').innerHTML = formHabilidadesLibres.map((h, i) =>
      `<span class="badge" style="display:inline-flex;align-items:center;gap:6px;">${esc(h.habilidad)} <span data-remove-hab="${i}" style="cursor:pointer;font-weight:700;">×</span></span>`
    ).join('');
    document.querySelectorAll('[data-remove-hab]').forEach(s => {
      s.addEventListener('click', () => { formHabilidadesLibres.splice(Number(s.dataset.removeHab), 1); renderHabilidadesLibresList(); });
    });
  }
  renderHabilidadesLibresList();

  document.getElementById('btn-add-habilidad').addEventListener('click', () => {
    const input = document.getElementById('nueva-habilidad');
    const val = input.value.trim();
    if (!val) return;
    formHabilidadesLibres.push({ habilidad: val });
    input.value = '';
    renderHabilidadesLibresList();
  });

  document.getElementById('persona-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      nombre: fd.get('nombre').trim(),
      telefono: fd.get('telefono').trim(),
      direccion: fd.get('direccion').trim(),
      grupo_ministerio: fd.get('grupo_ministerio').trim(),
      disponibilidad: fd.get('disponibilidad').trim(),
      notas: fd.get('notas').trim(),
      categoriaIds: Array.from(formCategoriasSeleccionadas),
      habilidadesLibres: formHabilidadesLibres.map(h => h.habilidad)
    };
    if (!payload.nombre) { toast('El nombre es obligatorio'); return; }
    const ok = id ? await updatePersona(id, payload) : await createPersona(payload);
    if (ok) { toast('Persona guardada'); location.hash = id ? ('#/persona/' + id) : '#/directorio'; }
  });
}

async function renderPersonaDetalle(id) {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const p = await fetchPersona(id);
  if (!p) { content.innerHTML = `<div class="empty-state">No se encontró esta persona.</div>`; return; }
  const categorias = await fetchCategorias();
  const catNames = p.persona_categorias.map(pc => categorias.find(c => c.id === pc.categoria_id)?.nombre).filter(Boolean);
  content.innerHTML = `
    <div class="view-header">
      <div class="back-row" style="margin-bottom:0;">
        <a class="icon-btn" href="#/directorio">${iconBack()}</a>
        <div class="view-title" style="font-size:26px;">${esc(p.nombre)}</div>
      </div>
      <a class="btn btn-outline" href="#/persona/${p.id}/editar">${iconEdit()} Editar</a>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div class="card" style="width:320px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:16px;">
          <div class="avatar" style="width:84px;height:84px;font-size:28px;background:${avatarColor(p.nombre)};">${initials(p.nombre)}</div>
          ${p.grupo_ministerio ? `<div class="muted">${esc(p.grupo_ministerio)}</div>` : ''}
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
        <div style="margin-bottom:14px;"><div class="muted" style="font-size:13px;font-weight:600;">Teléfono</div><div style="font-size:19px;font-weight:700;">${esc(p.telefono || '—')}</div></div>
        <div class="gap-8" style="margin-bottom:14px;flex-wrap:nowrap;">
          <a class="btn btn-accent2 btn-sm" style="flex:1;justify-content:center;" href="tel:${esc(p.telefono || '')}">${iconPhone()} Llamar</a>
          <a class="btn btn-whatsapp btn-sm" style="flex:1;justify-content:center;" href="https://wa.me/${(p.telefono || '').replace(/\D/g, '')}" target="_blank" rel="noopener">${iconChat()} WhatsApp</a>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
        <div style="margin-bottom:14px;"><div class="muted" style="font-size:13px;font-weight:600;">Dirección</div><div>${esc(p.direccion || '—')}</div></div>
        <div><div class="muted" style="font-size:13px;font-weight:600;">Disponibilidad</div><div>${esc(p.disponibilidad || '—')}</div></div>
      </div>
      <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:18px;">
        <div>
          <div class="section-label">Oficios y habilidades</div>
          <div class="gap-8">
            ${catNames.map(c => `<span class="badge" style="background:var(--accent);color:#fff;">${esc(c)}</span>`).join('')}
            ${p.persona_habilidades_libres.map(h => `<span class="badge">${esc(h.habilidad)}</span>`).join('')}
            ${(!catNames.length && !p.persona_habilidades_libres.length) ? '<span class="muted">Sin registrar</span>' : ''}
          </div>
        </div>
        <div class="card" style="flex-grow:1;">
          <div class="section-label">Notas</div>
          <div style="font-size:17px;line-height:1.6;">${esc(p.notas || 'Sin notas.')}</div>
        </div>
      </div>
    </div>
  `;
}

async function renderGrupos() {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const grupos = await fetchGrupos();
  content.innerHTML = `
    <div class="view-header">
      <div class="view-title">Grupos y ministerios</div>
      <button class="btn btn-accent2" id="btn-nuevo-grupo">${iconPlus()} Nuevo grupo</button>
    </div>
    <div id="nuevo-grupo-form" style="display:none;margin-bottom:20px;" class="card">
      <div class="field"><label>Nombre del grupo</label><input id="ng-nombre" placeholder="Ej. Coro Parroquial"></div>
      <div class="field"><label>Descripción</label><input id="ng-desc" placeholder="Ej. Ensayos los jueves a las 7:00 pm"></div>
      <button class="btn btn-primary" id="btn-guardar-grupo">Guardar grupo</button>
    </div>
    <div class="menu-grid">
      ${grupos.length ? grupos.map(g => `
        <a class="menu-card" href="#/grupos/${g.id}">
          <div class="title">${esc(g.nombre)}</div>
          <div class="meta" style="margin-bottom:10px;">${esc(g.descripcion || '')}</div>
          <span class="badge">${g.grupo_miembros.length} miembro${g.grupo_miembros.length === 1 ? '' : 's'}</span>
        </a>`).join('') : `<div class="empty-state">Todavía no hay grupos registrados.</div>`}
    </div>
  `;
  document.getElementById('btn-nuevo-grupo').addEventListener('click', () => {
    const f = document.getElementById('nuevo-grupo-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-guardar-grupo').addEventListener('click', async () => {
    const nombre = document.getElementById('ng-nombre').value.trim();
    const desc = document.getElementById('ng-desc').value.trim();
    if (!nombre) { toast('Ponle un nombre al grupo'); return; }
    const g = await createGrupo(nombre, desc);
    if (g) { toast('Grupo creado'); location.hash = '#/grupos/' + g.id; }
  });
}

async function renderGrupoDetalle(id) {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const res = await fetchGrupoDetalle(id);
  if (!res || !res.grupo) { content.innerHTML = `<div class="empty-state">No se encontró este grupo.</div>`; return; }
  const { grupo, miembros } = res;
  const todasPersonas = await fetchPersonas();
  const idsExistentes = new Set(miembros.map(m => m.persona_id));
  const disponibles = todasPersonas.filter(p => !idsExistentes.has(p.id));
  content.innerHTML = `
    <div class="back-row">
      <a class="icon-btn" href="#/grupos">${iconBack()}</a>
      <div class="view-title" style="font-size:26px;">${esc(grupo.nombre)}</div>
    </div>
    ${grupo.descripcion ? `<div class="muted" style="margin-bottom:20px;">${esc(grupo.descripcion)}</div>` : ''}
    <div class="section-label">Miembros (${miembros.length})</div>
    <div style="margin-bottom:22px;">
      ${miembros.length ? miembros.map(m => `
        <div class="person-row">
          <div class="avatar" style="background:${avatarColor(m.personas.nombre)};">${initials(m.personas.nombre)}</div>
          <div style="flex-grow:1;font-weight:700;font-size:18px;">${esc(m.personas.nombre)}</div>
          <div class="muted">${esc(m.personas.telefono || '')}</div>
          <button class="btn btn-plain btn-sm" data-quitar="${m.persona_id}">Quitar</button>
        </div>`).join('') : `<div class="empty-state">Todavía no hay miembros en este grupo.</div>`}
    </div>
    <div class="section-label">Agregar miembro</div>
    <div style="display:flex;gap:10px;">
      <select id="select-persona" style="flex-grow:1;height:48px;border:2px solid var(--border);border-radius:12px;padding:0 16px;">
        <option value="">Selecciona una persona...</option>
        ${disponibles.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" id="btn-add-miembro">Agregar</button>
    </div>
  `;
  document.getElementById('btn-add-miembro').addEventListener('click', async () => {
    const pid = document.getElementById('select-persona').value;
    if (!pid) return;
    if (await addMiembroAGrupo(id, pid)) { toast('Miembro agregado'); renderGrupoDetalle(id); }
  });
  content.querySelectorAll('[data-quitar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await quitarMiembroDeGrupo(id, btn.dataset.quitar)) { toast('Miembro quitado'); renderGrupoDetalle(id); }
    });
  });
}

async function renderCalendario() {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const eventos = await fetchEventos();
  content.innerHTML = `
    <div class="view-header">
      <div class="view-title">Calendario de eventos</div>
      <button class="btn btn-accent2" id="btn-nuevo-evento">${iconPlus()} Nuevo evento</button>
    </div>
    <div id="nuevo-evento-form" style="display:none;margin-bottom:20px;" class="card">
      <div class="field"><label>Título</label><input id="ev-titulo" placeholder="Ej. Misa dominical"></div>
      <div class="field-row">
        <div class="field"><label>Fecha</label><input id="ev-fecha" type="date"></div>
        <div class="field"><label>Hora</label><input id="ev-hora" type="time"></div>
      </div>
      <div class="field"><label>Lugar</label><input id="ev-lugar" placeholder="Ej. Templo principal"></div>
      <button class="btn btn-primary" id="btn-guardar-evento">Guardar evento</button>
    </div>
    <div class="section-label">Próximos eventos</div>
    ${eventos.length ? eventos.map(e => `
      <div class="person-row">
        <div style="width:60px;height:60px;border-radius:14px;background:var(--accent);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">
          <div style="font-size:20px;font-weight:700;line-height:1;">${new Date(e.fecha + 'T00:00:00').getDate()}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;">${new Date(e.fecha + 'T00:00:00').toLocaleDateString('es-GT', { month: 'short' })}</div>
        </div>
        <div style="flex-grow:1;">
          <div style="font-size:19px;font-weight:700;">${esc(e.titulo)}</div>
          <div class="muted">${e.hora ? e.hora.slice(0, 5) + ' · ' : ''}${esc(e.lugar || '')}</div>
        </div>
      </div>`).join('') : `<div class="empty-state">No hay eventos programados todavía.</div>`}
  `;
  document.getElementById('btn-nuevo-evento').addEventListener('click', () => {
    const f = document.getElementById('nuevo-evento-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-guardar-evento').addEventListener('click', async () => {
    const titulo = document.getElementById('ev-titulo').value.trim();
    const fecha = document.getElementById('ev-fecha').value;
    const hora = document.getElementById('ev-hora').value;
    const lugar = document.getElementById('ev-lugar').value.trim();
    if (!titulo || !fecha) { toast('Ponle título y fecha al evento'); return; }
    if (await createEvento({ titulo, fecha, hora: hora || null, lugar })) { toast('Evento guardado'); renderCalendario(); }
  });
}

let sacramentosFiltro = 'Todos';

async function renderSacramentos() {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const registros = await fetchSacramentos(sacramentosFiltro);
  const tipos = ['Todos', 'Bautizo', 'Primera comunión', 'Confirmación', 'Matrimonio'];
  content.innerHTML = `
    <div class="view-header">
      <div class="view-title">Sacramentos</div>
      <button class="btn btn-accent2" id="btn-nuevo-sacramento">${iconPlus()} Registrar sacramento</button>
    </div>
    <div id="nuevo-sacramento-form" style="display:none;margin-bottom:20px;" class="card">
      <div class="field"><label>Nombre</label><input id="sa-nombre" placeholder="Nombre de la persona (o grupo)"></div>
      <div class="field-row">
        <div class="field"><label>Sacramento</label>
          <select id="sa-tipo">
            <option>Bautizo</option><option>Primera comunión</option><option>Confirmación</option><option>Matrimonio</option>
          </select>
        </div>
        <div class="field"><label>Fecha</label><input id="sa-fecha" type="date"></div>
      </div>
      <div class="field"><label>Padrinos</label><input id="sa-padrinos" placeholder="Ej. Ana y Luis Ramírez"></div>
      <button class="btn btn-primary" id="btn-guardar-sacramento">Guardar registro</button>
    </div>
    <div class="gap-8" style="margin-bottom:18px;">
      ${tipos.map(t => `<button class="pill ${sacramentosFiltro === t ? 'selected' : ''}" data-tipo="${t}">${t}</button>`).join('')}
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr><th>Nombre</th><th>Sacramento</th><th>Fecha</th><th>Padrinos</th></tr></thead>
        <tbody>
          ${registros.length ? registros.map(r => `<tr><td style="font-weight:600;">${esc(r.nombre_persona)}</td><td><span class="badge">${esc(r.tipo)}</span></td><td class="muted">${formatFecha(r.fecha)}</td><td class="muted">${esc(r.padrinos || '—')}</td></tr>`).join('') : `<tr><td colspan="4" class="muted" style="text-align:center;padding:30px;">No hay registros todavía.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('btn-nuevo-sacramento').addEventListener('click', () => {
    const f = document.getElementById('nuevo-sacramento-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  content.querySelectorAll('[data-tipo]').forEach(btn => {
    btn.addEventListener('click', () => { sacramentosFiltro = btn.dataset.tipo; renderSacramentos(); });
  });
  document.getElementById('btn-guardar-sacramento').addEventListener('click', async () => {
    const nombre_persona = document.getElementById('sa-nombre').value.trim();
    const tipo = document.getElementById('sa-tipo').value;
    const fecha = document.getElementById('sa-fecha').value;
    const padrinos = document.getElementById('sa-padrinos').value.trim();
    if (!nombre_persona || !fecha) { toast('Completa nombre y fecha'); return; }
    if (await createSacramento({ nombre_persona, tipo, fecha, padrinos })) { toast('Registro guardado'); renderSacramentos(); }
  });
}

async function renderAvisos() {
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const avisos = await fetchAvisos();
  content.innerHTML = `
    <div class="view-header">
      <div class="view-title">Avisos y comunicados</div>
      <button class="btn btn-accent2" id="btn-nuevo-aviso">${iconPlus()} Nuevo aviso</button>
    </div>
    <div id="nuevo-aviso-form" style="display:none;margin-bottom:20px;" class="card">
      <div class="field"><label>Título</label><input id="av-titulo" placeholder="Ej. Cambio de horario de misa"></div>
      <div class="field"><label>Contenido</label><textarea id="av-contenido" placeholder="Escribe el aviso completo..."></textarea></div>
      <div class="field-row">
        <div class="field"><label>Estado</label><select id="av-estado"><option>Publicado</option><option>Programado</option></select></div>
        <div class="field"><label>Fecha</label><input id="av-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <button class="btn btn-primary" id="btn-guardar-aviso">Guardar aviso</button>
    </div>
    ${avisos.length ? avisos.map(a => `
      <div class="card" style="margin-bottom:14px;">
        <div class="flex-between">
          <div style="font-size:20px;font-weight:700;">${esc(a.titulo)}</div>
          <span class="badge" style="${a.estado === 'Publicado' ? 'background:#E7F0EA;color:#2F5D50;' : 'background:#FBEFE7;color:#C1694B;'}">${a.estado}</span>
        </div>
        <div class="muted" style="font-size:14px;margin:6px 0 10px 0;">${a.estado === 'Publicado' ? 'Publicado el ' : 'Se publicará el '}${formatFecha(a.fecha_publicacion)}</div>
        <div style="font-size:16px;line-height:1.5;">${esc(a.contenido)}</div>
      </div>`).join('') : `<div class="empty-state">Todavía no hay avisos publicados.</div>`}
  `;
  document.getElementById('btn-nuevo-aviso').addEventListener('click', () => {
    const f = document.getElementById('nuevo-aviso-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-guardar-aviso').addEventListener('click', async () => {
    const titulo = document.getElementById('av-titulo').value.trim();
    const contenido = document.getElementById('av-contenido').value.trim();
    const estado = document.getElementById('av-estado').value;
    const fecha_publicacion = document.getElementById('av-fecha').value;
    if (!titulo || !contenido) { toast('Completa título y contenido'); return; }
    if (await createAviso({ titulo, contenido, estado, fecha_publicacion })) { toast('Aviso guardado'); renderAvisos(); }
  });
}

async function renderUsuarios() {
  if (!currentUser || currentUser.rol !== 'admin') {
    content.innerHTML = `<div class="empty-state">No tienes permiso para ver esta sección.</div>`;
    return;
  }
  content.innerHTML = `<div class="muted">Cargando…</div>`;
  const [usuarios, roles] = await Promise.all([fetchUsuarios(), fetchRolesList()]);
  content.innerHTML = `
    <div class="view-header">
      <div class="view-title">Usuarios</div>
      <button class="btn btn-accent2" id="btn-nuevo-usuario">${iconPlus()} Agregar usuario</button>
    </div>
    <div id="nuevo-usuario-form" style="display:none;margin-bottom:20px;" class="card">
      <div class="field"><label>Nombre</label><input id="us-nombre" placeholder="Nombre completo"></div>
      <div class="field"><label>Correo</label><input id="us-email" type="email" placeholder="correo@ejemplo.com"></div>
      <div class="field"><label>Rol</label>
        <select id="us-rol">${roles.map(r => `<option value="${esc(r.nombre)}">${esc(r.nombre)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-primary" id="btn-guardar-usuario">Enviar invitación</button>
      <div class="muted" style="font-size:14px;margin-top:8px;">Se le enviará un correo para que cree su propia contraseña.</div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${usuarios.map(u => `
            <tr>
              <td style="font-weight:600;">${esc(u.nombre)}</td>
              <td class="muted">${esc(u.email)}</td>
              <td>
                <select data-cambiar-rol="${u.user_id}" ${u.user_id === currentUser.id ? 'disabled' : ''} style="height:38px;border:2px solid var(--border);border-radius:10px;">
                  ${roles.map(r => `<option value="${r.id}" ${r.nombre === u.roles?.nombre ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}
                </select>
              </td>
              <td><span class="badge" style="${u.activo ? 'background:#E7F0EA;color:#2F5D50;' : 'background:#FBEFE7;color:#C1694B;'}">${u.activo ? 'Activo' : 'Desactivado'}</span></td>
              <td>${u.user_id === currentUser.id ? '' : `<button class="btn btn-plain btn-sm" data-toggle-activo="${u.user_id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
    const f = document.getElementById('nuevo-usuario-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-guardar-usuario').addEventListener('click', async () => {
    const nombre = document.getElementById('us-nombre').value.trim();
    const email = document.getElementById('us-email').value.trim();
    const rol = document.getElementById('us-rol').value;
    if (!nombre || !email) { toast('Completa nombre y correo'); return; }
    if (await crearUsuario({ email, nombre, rol })) { toast('Invitación enviada'); renderUsuarios(); }
  });
  content.querySelectorAll('[data-cambiar-rol]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (await actualizarRolUsuario(sel.dataset.cambiarRol, sel.value)) toast('Rol actualizado');
    });
  });
  content.querySelectorAll('[data-toggle-activo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nuevoEstado = btn.dataset.activo !== 'true';
      if (await actualizarActivoUsuario(btn.dataset.toggleActivo, nuevoEstado)) { toast(nuevoEstado ? 'Usuario activado' : 'Usuario desactivado'); renderUsuarios(); }
    });
  });
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------
function setActiveNav(route) {
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.route === route));
}

function renderRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'menu';
  const parts = hash.split('/');
  setActiveNav(parts[0]);
  switch (parts[0]) {
    case 'menu': renderMenu(); break;
    case 'directorio': renderDirectorio(); break;
    case 'persona':
      if (parts[1] === 'nueva') renderPersonaForm(null);
      else if (parts[2] === 'editar') renderPersonaForm(parts[1]);
      else renderPersonaDetalle(parts[1]);
      break;
    case 'grupos':
      if (parts[1]) renderGrupoDetalle(parts[1]); else renderGrupos();
      break;
    case 'calendario': renderCalendario(); break;
    case 'sacramentos': renderSacramentos(); break;
    case 'avisos': renderAvisos(); break;
    case 'usuarios': renderUsuarios(); break;
    default: renderMenu();
  }
}

let appInitialized = false;
function ensureAppInitialized() {
  if (appInitialized) return;
  appInitialized = true;
  document.querySelectorAll('.nav-link[data-route]').forEach(btn => {
    btn.addEventListener('click', () => { location.hash = '#/' + btn.dataset.route; });
  });
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  window.addEventListener('hashchange', renderRoute);
}

// ------------------------------------------------------------
// Sesión / inicio de sesión
// ------------------------------------------------------------
async function doLogout() {
  await sb.auth.signOut();
  currentUser = null;
  location.hash = '';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-gate').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

async function onLoggedIn(session) {
  const perfil = await fetchMiPerfil(session.user.id);
  if (!perfil || !perfil.activo) {
    await sb.auth.signOut();
    document.getElementById('login-error').textContent = 'Tu cuenta no está activa. Contacta al administrador.';
    return;
  }
  currentUser = { id: session.user.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.roles?.nombre };
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('nav-usuarios').style.display = currentUser.rol === 'admin' ? 'block' : 'none';
  ensureAppInitialized();
  renderRoute();
}

async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');
  errorBox.textContent = '';
  if (!email || !password) { errorBox.textContent = 'Completa correo y contraseña'; return; }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errorBox.textContent = 'Correo o contraseña incorrectos'; return; }
  await onLoggedIn(data.session);
}
document.getElementById('login-submit').addEventListener('click', submitLogin);
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });

document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const errorBox = document.getElementById('login-error');
  if (!email) { errorBox.textContent = 'Escribe tu correo arriba y presiona el enlace de nuevo'; return; }
  errorBox.style.color = '';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) { errorBox.textContent = 'Error: ' + error.message; return; }
  errorBox.style.color = 'var(--accent)';
  errorBox.textContent = 'Te enviamos un correo con instrucciones.';
});

function showSetPasswordGate() {
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('setpass-gate').style.display = 'flex';
}

async function submitSetPassword() {
  const p1 = document.getElementById('setpass-1').value;
  const p2 = document.getElementById('setpass-2').value;
  const err = document.getElementById('setpass-error');
  err.textContent = '';
  if (!p1 || p1.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
  if (p1 !== p2) { err.textContent = 'Las contraseñas no coinciden'; return; }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) { err.textContent = 'Error: ' + error.message; return; }
  document.getElementById('setpass-gate').style.display = 'none';
  const { data: { session } } = await sb.auth.getSession();
  await onLoggedIn(session);
}
document.getElementById('setpass-submit').addEventListener('click', submitSetPassword);
document.getElementById('setpass-2').addEventListener('keydown', e => { if (e.key === 'Enter') submitSetPassword(); });

async function checkSessionAndStart() {
  if (!sb) {
    document.querySelector('#login-gate .pin-card').innerHTML = `<div class="empty-state">⚠️ Falta configurar la conexión con Supabase en <code>js/config.js</code>.</div>`;
    return;
  }
  if (authFlowError) {
    document.getElementById('login-error').textContent = 'El enlace no es válido o ya expiró. Pide que te reenvíen la invitación.';
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session && (authFlowType === 'invite' || authFlowType === 'recovery')) {
    showSetPasswordGate();
  } else if (session) {
    await onLoggedIn(session);
  }
}

checkSessionAndStart();
