const CONFIG = window.APP_CONFIG || {};
const BACKEND_MODE = Boolean(CONFIG.BACKEND_MODE);
const SUPABASE_URL = CONFIG.SUPABASE_URL || "PASTE_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || "PASTE_SUPABASE_ANON_KEY_HERE";
const CLOUDINARY_CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME || "PASTE_CLOUDINARY_CLOUD_NAME_HERE";
const CLOUDINARY_UPLOAD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET || "PASTE_CLOUDINARY_UPLOAD_PRESET_HERE";
const ONESIGNAL_APP_ID = CONFIG.ONESIGNAL_APP_ID || "";
// Do not persist Supabase sessions in browser storage.
// This forces every fresh app open to show the login screen instead of auto-opening admin dashboard.
const supabaseClient = (BACKEND_MODE && window.supabase && !SUPABASE_URL.includes('PASTE_') && !SUPABASE_ANON_KEY.includes('PASTE_'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null;

function backendConfigured(){
  return Boolean(BACKEND_MODE && supabaseClient && CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET && !CLOUDINARY_CLOUD_NAME.includes('PASTE_') && !CLOUDINARY_UPLOAD_PRESET.includes('PASTE_'));
}
async function uploadFileToCloudinary(file){
  if(!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_CLOUD_NAME.includes('PASTE_')){
    throw new Error('Cloudinary is not configured. Add cloud name and unsigned upload preset in config.js.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  // Use image/upload only for images. PDFs, DOC, PPT, ZIP and other study files should
  // go to raw/upload. This avoids Chrome PDF preview failures on /image/upload URLs.
  const isImage = file.type && file.type.startsWith('image/');
  const resourceType = isImage ? 'image' : 'raw';
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

  const res = await fetch(endpoint, { method: 'POST', body: form });
  const data = await res.json();
  if(!res.ok){ throw new Error(data.error?.message || 'Cloudinary upload failed'); }
  data.resource_type = data.resource_type || resourceType;
  return data;
}
async function saveStudyMaterialMetadata(material){
  if(!supabaseClient){ throw new Error('Supabase is not configured. Add URL and anon key in config.js.'); }
  const { error } = await supabaseClient.from('study_materials').insert(material);
  if(error){ throw error; }
}

async function backendSelect(table){
  if(!supabaseClient) return [];
  const { data, error } = await supabaseClient.from(table).select('*');
  if(error){ console.error(`Supabase select ${table} failed`, error); throw error; }
  return data || [];
}
async function backendSelectOptional(table){
  if(!supabaseClient) return [];
  const { data, error } = await supabaseClient.from(table).select('*');
  if(error){
    console.warn(`Optional Supabase table ${table} not available yet`, error.message || error);
    return [];
  }
  return data || [];
}
function mapBackendMaterial(m){
  return {
    ...m,
    file_url: m.cloudinary_url || m.file_url || '#',
    file_type: m.file_type || 'FILE',
    uploaded_by: m.uploaded_by_profile_id || m.uploaded_by || '',
    created_at: (m.created_at || '').slice(0,10)
  };
}
function mapBackendNotice(n){
  return {
    ...n,
    body: n.body || n.message || '',
    created_by: n.created_by_profile_id || n.created_by || '',
    created_at: (n.created_at || '').slice(0,10)
  };
}
async function loadBackendData(){
  if(!BACKEND_MODE || !supabaseClient) return;
  const [profiles, teachers, students, batches, studentBatches, teacherBatches, attendance, fees, notices, materials, tests, results] = await Promise.all([
    backendSelect('profiles'),
    backendSelect('teachers'),
    backendSelect('students'),
    backendSelect('batches'),
    backendSelectOptional('student_batches'),
    backendSelectOptional('teacher_batches'),
    backendSelect('attendance'),
    backendSelect('fees'),
    backendSelect('notices'),
    backendSelect('study_materials'),
    backendSelect('tests'),
    backendSelect('test_results')
  ]);
  state.users = profiles.map(p => ({...p, id:p.id, password:'', full_name:p.full_name || p.email, status:p.status || 'active'}));
  state.teachers = teachers.map(t => ({...t, status:t.status || 'active'}));
  state.students = students.map(s => ({...s, status:s.status || 'active'}));
  state.batches = batches.map(b => ({...b, status:b.status || 'active'}));
  state.studentBatches = studentBatches.map(x => ({...x}));
  state.teacherBatches = teacherBatches.map(x => ({...x}));
  // Backward compatibility: old rows may still store only students.batch_id or batches.teacher_id.
  // Mirror those into local assignment arrays so the app supports both old and new database data.
  state.students.forEach(s => { if(s.batch_id && !state.studentBatches.some(x=>x.student_id===s.id && x.batch_id===s.batch_id)) state.studentBatches.push({id:'legacy-sb-'+s.id+'-'+s.batch_id, student_id:s.id, batch_id:s.batch_id}); });
  state.batches.forEach(b => { if(b.teacher_id && !state.teacherBatches.some(x=>x.teacher_id===b.teacher_id && x.batch_id===b.id)) state.teacherBatches.push({id:'legacy-tb-'+b.teacher_id+'-'+b.id, teacher_id:b.teacher_id, batch_id:b.id}); });
  state.attendance = attendance.map(a => ({...a, created_at:(a.created_at||'').slice(0,10)}));
  state.fees = fees.map(f => ({...f, amount:Number(f.amount||0), paid_amount:Number(f.paid_amount||0), created_at:(f.created_at||'').slice(0,10)}));
  state.notices = notices.map(mapBackendNotice);
  state.materials = materials.map(mapBackendMaterial);
  state.tests = tests;
  state.results = results;
}
async function backendLogin(email,password){
  if(!supabaseClient) throw new Error('Supabase is not configured. Check config.js.');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if(error) throw error;
  const authUser = data.user;
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single();
  if(profileError || !profile) throw new Error('Login succeeded but no profile row exists for this user. Add profile row in Supabase.');
  if(profile.status !== 'active') throw new Error('Account inactive. Contact admin.');
  await loadBackendData();
  const teacher = state.teachers.find(t => t.profile_id === profile.id || t.email === profile.email);
  const student = state.students.find(s => s.profile_id === profile.id || s.email === profile.email);
  return {...profile, id:profile.id, full_name:profile.full_name || profile.email, teacher_id:teacher?.id, student_id:student?.id};
}
async function insertRow(table,row){
  const { data, error } = await supabaseClient.from(table).insert(row).select().single();
  if(error) throw error;
  return data;
}
async function upsertRows(table, rows, onConflict){
  if(!rows || !rows.length) return [];
  const q = supabaseClient.from(table).upsert(rows, onConflict ? { onConflict } : undefined).select();
  const { data, error } = await q;
  if(error) throw error;
  return data || [];
}
async function updateRow(table,id,row){
  const { data, error } = await supabaseClient.from(table).update(row).eq('id',id).select().single();
  if(error) throw error;
  return data;
}
async function updateWhere(table,row,column,value){
  const { error } = await supabaseClient.from(table).update(row).eq(column,value);
  if(error) throw error;
}
async function deleteRow(table,id){
  const { error } = await supabaseClient.from(table).delete().eq('id',id);
  if(error) {
    if(String(error.message||'').toLowerCase().includes('row-level security')){
      throw new Error(error.message + ' Run the updated RLS_TESTING_POLICIES.sql so DELETE is allowed during testing.');
    }
    throw error;
  }
}
async function deleteWhere(table,column,value){
  const { error } = await supabaseClient.from(table).delete().eq(column,value);
  if(error) {
    if(String(error.message||'').toLowerCase().includes('row-level security')){
      throw new Error(error.message + ' Run the updated RLS_TESTING_POLICIES.sql so DELETE is allowed during testing.');
    }
    throw error;
  }
}
async function deleteStudentRecord(id){
  const s = state.students.find(x=>x.id===id);
  if(BACKEND_MODE && supabaseClient){
    // Delete child records first so the UI delete does not fail on FK/RLS edge cases.
    await deleteWhere('student_batches','student_id',id).catch(()=>{});
    await deleteWhere('attendance','student_id',id).catch(()=>{});
    await deleteWhere('fees','student_id',id).catch(()=>{});
    await deleteWhere('test_results','student_id',id).catch(()=>{});
    await deleteRow('students', id);
    // Delete linked profile record from app DB if present. Auth user deletion still requires Supabase dashboard/service-role backend.
    if(s?.profile_id) await deleteRow('profiles', s.profile_id).catch(()=>{});
    return;
  }
  state.students = state.students.filter(x=>x.id!==id);
  state.attendance = state.attendance.filter(x=>x.student_id!==id);
  state.fees = state.fees.filter(x=>x.student_id!==id);
  state.results = state.results.filter(x=>x.student_id!==id);
}
async function deleteTeacherRecord(id){
  const t = state.teachers.find(x=>x.id===id);
  if(BACKEND_MODE && supabaseClient){
    // Clear references first. Otherwise PostgreSQL can block teacher deletion because batches/materials/tests still point to this teacher.
    await updateWhere('batches',{teacher_id:null},'teacher_id',id).catch(()=>{});
    await updateWhere('attendance',{teacher_id:null},'teacher_id',id).catch(()=>{});
    await updateWhere('tests',{teacher_id:null},'teacher_id',id).catch(()=>{});
    await updateWhere('study_materials',{teacher_id:null},'teacher_id',id).catch(()=>{});
    if(t?.profile_id){
      try { await deleteRow('profiles', t.profile_id); return; }
      catch(profileErr){ console.warn('Profile delete failed, deleting teacher row only:', profileErr); }
    }
    await deleteRow('teachers', id);
    return;
  }
  state.teachers = state.teachers.filter(x=>x.id!==id);
  state.batches = state.batches.map(b=>b.teacher_id===id?{...b,teacher_id:null}:b);
}
async function deleteBatchRecord(id){
  if(BACKEND_MODE && supabaseClient){
    // Keep old records but detach the batch so deletion is not blocked by foreign-key references.
    await updateWhere('students',{batch_id:null},'batch_id',id).catch(()=>{});
    await updateWhere('notices',{batch_id:null},'batch_id',id).catch(()=>{});
    await updateWhere('tests',{batch_id:null},'batch_id',id).catch(()=>{});
    await updateWhere('study_materials',{batch_id:null},'batch_id',id).catch(()=>{});
    await deleteRow('batches', id);
    return;
  }
  state.batches = state.batches.filter(x=>x.id!==id);
  state.students = state.students.map(s=>s.batch_id===id?{...s,batch_id:null}:s);
  state.attendance = state.attendance.filter(x=>x.batch_id!==id);
}
async function refreshAndRender(msg){
  if(BACKEND_MODE && supabaseClient) await loadBackendData();
  if(msg) toast(msg);
  render();
}

const state = {
  currentUser: null,
  section: 'dashboard',
  users: [],
  teachers: [],
  students: [],
  batches: [],
  studentBatches: [],
  teacherBatches: [],
  attendance: [],
  fees: [],
  notices: [],
  materials: [],
  tests: [],
  results: []
};

const $ = (id) => document.getElementById(id);
function uid(prefix){return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6)}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}

function oneSignalReady(){
  return Boolean(ONESIGNAL_APP_ID && window.OneSignalDeferred);
}
async function setupOneSignalUser(){
  if(!oneSignalReady() || !state.currentUser) return;
  window.OneSignalDeferred.push(async function(OneSignal){
    try{
      const externalId = state.currentUser.auth_user_id || state.currentUser.id || state.currentUser.email;
      if(externalId && OneSignal.login) await OneSignal.login(String(externalId));
      if(OneSignal.User && OneSignal.User.addTags){
        await OneSignal.User.addTags({
          role: state.currentUser.role || '',
          email: state.currentUser.email || '',
          name: state.currentUser.full_name || state.currentUser.name || ''
        });
      }
    }catch(err){ console.warn('OneSignal user setup failed', err); }
  });
}
window.enablePushNotifications = async function(){
  if(!oneSignalReady()){
    toast('Notification system is not loaded yet.');
    return;
  }
  window.OneSignalDeferred.push(async function(OneSignal){
    try{
      await OneSignal.Notifications.requestPermission();
      await setupOneSignalUser();
      toast('Notifications enabled');
    }catch(err){
      console.error(err);
      toast('Could not enable notifications');
    }
  });
};

function batchName(id){return state.batches.find(b=>b.id===id)?.batch_name || 'General'}
function teacherName(id){return state.teachers.find(t=>t.id===id)?.name || 'Unassigned'}
function studentName(id){return state.students.find(s=>s.id===id)?.name || 'Unknown'}
function pillStatus(status){let cls=status==='paid'||status==='present'||status==='active'?'ok':status==='pending'||status==='late'||status==='partial'?'warn':'bad';return `<span class="pill ${cls}">${status}</span>`}
function formatBytes(bytes){const n=Number(bytes||0);if(!n)return '0 B';const units=['B','KB','MB','GB'];let i=0,v=n;while(v>=1024&&i<units.length-1){v/=1024;i++;}return `${v.toFixed(v>=10||i===0?0:1)} ${units[i]}`}
function materialKind(m){const ext=String(m.file_type||m.file_name||m.file_url||'').toLowerCase();if(ext.includes('pdf'))return 'pdf';if(/jpg|jpeg|png|webp|gif|image/.test(ext))return 'image';return 'file'}
function safeFileName(m){
  const ext=String(m.file_type || 'file').toLowerCase().replace(/[^a-z0-9]+/g,'') || 'file';
  const raw = `${m.title || m.file_name || 'study-material'}.${ext}`;
  return raw.replace(/[^a-z0-9._-]+/gi,'_');
}
function normalizedMaterialUrl(url, m){
  if(!url || url==='#') return '#';
  let clean = String(url).trim();
  // Remove broken Cloudinary fl_attachment transformation from older versions.
  clean = clean.replace(/\/upload\/fl_attachment[^/]*\//, '/upload/');
  // PDFs/files uploaded earlier may be stored as /image/upload/. For documents, use raw delivery.
  const kind = materialKind(m || {file_url:clean});
  if(kind !== 'image'){
    clean = clean.replace('/image/upload/', '/raw/upload/');
  }
  // Remove any remaining transformation segment before the version marker.
  clean = clean.replace(/\/upload\/(?!v\d+\/)(?:[^/]+\/)+(v\d+\/)/, '/upload/$1');
  return clean;
}
function materialActionLabel(m){const kind=materialKind(m);if(kind==='image')return 'Download Image';if(kind==='pdf')return 'Download PDF';return 'Download File'}
async function downloadFileFromUrl(url, filename, material){
  if(!url || url==='#'){toast('File link missing');return false;}
  const finalUrl = normalizedMaterialUrl(url, material);
  try{
    const res = await fetch(finalUrl, { mode:'cors' });
    if(!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=blobUrl;
    a.download = filename || 'study-material';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(blobUrl);a.remove();},800);
    toast('Download started');
    return true;
  }catch(err){
    console.error('Material download failed', err);
    toast('Download failed. Re-upload this file once, then try again.');
    return false;
  }
}
window.downloadMaterial=async(id)=>{
  const m=state.materials.find(x=>x.id===id);
  if(!m){toast('Material not found');return;}
  await downloadFileFromUrl(m.file_url, safeFileName(m), m);
}
function currentTeacher(){const u=state.currentUser;return state.teachers.find(x=>x.profile_id===u?.id)||state.teachers.find(x=>x.email===u?.email)||null}
function isAllowedSection(section){const role=state.currentUser?.role;if(!role)return false;const allowed={admin:['dashboard','students','teachers','batches','attendance','fees','notices','materials','tests','ai','profile','more'],teacher:['dashboard','students','batches','attendance','notices','materials','tests','ai','profile','more'],student:['dashboard','attendance','fees','notices','materials','tests','ai','profile','more']};return allowed[role].includes(section)}
function timeText(v){return v&&String(v).trim()?v:'--:--'}

function money(n){return `₹${Number(n||0).toLocaleString('en-IN')}`}
function searchBox(label='Search this section'){return `<div class="search-card"><input id="sectionSearch" class="search-input" placeholder="🔎 ${label}" autocomplete="off"></div>`}

const LEGAL_TEXT = {
  privacy: {
    title: 'Privacy Policy',
    body: `
      <p><strong>Effective date:</strong> 10 June 2026</p>
      <p>This Privacy Policy explains how M.S Coaching Centre handles information inside this student, teacher, and admin app.</p>
      <h3>1. Information we collect</h3>
      <p>The app may store account details, name, email, role, batch, attendance records, fee records, notices, test/result data, and study material upload details.</p>
      <h3>2. Why we use this information</h3>
      <p>Information is used only for coaching-centre management, including login access, attendance tracking, fee tracking, notices, study materials, tests, results, and role-based dashboards.</p>
      <h3>3. Who can access data</h3>
      <p>Admin users may access and manage centre records. Teacher users may access allowed academic records assigned to them. Student users should only access their own permitted information.</p>
      <h3>4. Third-party services</h3>
      <p>The app uses Supabase for authentication/database features and Cloudinary for file uploads. These services may process app data as needed to run the backend.</p>
      <h3>5. Data security</h3>
      <p>The app uses role-based access and backend rules where configured. The centre must keep Supabase, Cloudinary, and admin credentials secure.</p>
      <h3>6. Data correction or deletion</h3>
      <p>Students, parents, or staff can contact the coaching centre admin to correct or delete inaccurate records where legally and operationally possible.</p>
      <h3>7. Contact</h3>
      <p>For privacy questions, contact M.S Coaching Centre administration.</p>
    `
  },
  terms: {
    title: 'Terms & Conditions',
    body: `
      <p><strong>Effective date:</strong> 10 June 2026</p>
      <p>By logging in, you agree to use the M.S Coaching Centre app responsibly and only for authorised coaching-centre purposes.</p>
      <h3>1. Authorised access only</h3>
      <p>Only registered admin, teacher, and student accounts may use this app. Users must not share passwords or access another person’s account.</p>
      <h3>2. Role-based use</h3>
      <p>Admins, teachers, and students must use only the features allowed for their role. Attempting to bypass access controls is not allowed.</p>
      <h3>3. Accuracy of records</h3>
      <p>Attendance, fees, notices, study materials, and results should be entered carefully. Any wrong data should be reported to the centre admin for correction.</p>
      <h3>4. Study materials</h3>
      <p>Uploaded study materials should be educational and appropriate for coaching-centre use. Do not upload harmful, illegal, or unrelated files.</p>
      <h3>5. Account responsibility</h3>
      <p>Users are responsible for keeping login details private. The centre may restrict or delete accounts that misuse the app.</p>
      <h3>6. Service changes</h3>
      <p>The app may be updated, fixed, or changed as needed for security, performance, or centre operations.</p>
      <h3>7. Acceptance required</h3>
      <p>Users cannot login unless they accept the Privacy Policy and Terms & Conditions on the login page.</p>
    `
  }
};
function setupLegalConsent(){
  const consent = $('legalConsent');
  const submit = $('loginSubmitBtn');
  const modal = $('legalModal');
  const title = $('legalModalTitle');
  const body = $('legalModalBody');
  const close = $('legalModalClose');
  if(!consent || !submit) return;
  const sync = () => { submit.disabled = !consent.checked; };
  consent.addEventListener('change', sync);
  sync();
  document.querySelectorAll('[data-legal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = LEGAL_TEXT[btn.dataset.legal];
      if(!data || !modal || !title || !body) return;
      title.textContent = data.title;
      body.innerHTML = data.body;
      modal.classList.add('show');
      modal.setAttribute('aria-hidden','false');
    });
  });
  const hide = () => { if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); } };
  if(close) close.addEventListener('click', hide);
  if(modal) modal.addEventListener('click', e => { if(e.target === modal) hide(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') hide(); });
}
setupLegalConsent();

function searchable(text,html){return `<div class="searchable" data-search="${String(text).toLowerCase().replace(/"/g,'&quot;')}">${html}</div>`}
function attachSearch(){const input=$('sectionSearch'); if(!input) return; input.oninput=()=>{const q=input.value.trim().toLowerCase();document.querySelectorAll('.searchable').forEach(el=>{el.style.display=el.dataset.search.includes(q)?'':'none'});};}
function feePaidAmount(f){if(f.status==='paid') return Number(f.amount||0); if(f.status==='partial') return Number(f.paid_amount||0); return Number(f.paid_amount||0)}
function feeSummary(fees){const totalFee=fees.reduce((sum,f)=>sum+Number(f.amount||0),0);const totalRevenue=fees.reduce((sum,f)=>sum+feePaidAmount(f),0);const totalPending=fees.filter(f=>f.status==='pending'||f.status==='partial').reduce((sum,f)=>sum+Math.max(Number(f.amount||0)-feePaidAmount(f),0),0);const totalOverdue=fees.filter(f=>f.status==='overdue').reduce((sum,f)=>sum+Math.max(Number(f.amount||0)-feePaidAmount(f),0),0);return {totalFee,totalRevenue,totalPending,totalOverdue}}
function feeChart(fees){const summary=feeSummary(fees);const revenue=summary.totalRevenue;const pending=summary.totalPending;const overdue=summary.totalOverdue;const total=Math.max(revenue+pending+overdue,1);const revDeg=(revenue/total)*360;const pendingDeg=revDeg+(pending/total)*360;return `<div class="card fee-chart-card"><h3>Fee Distribution</h3><div class="fee-chart-wrap"><div class="pie-chart" style="background:conic-gradient(var(--ok) 0deg ${revDeg}deg, var(--accent) ${revDeg}deg ${pendingDeg}deg, var(--danger) ${pendingDeg}deg 360deg)"><span>${money(summary.totalFee)}</span></div><div class="chart-legend"><span><i class="legend-dot ok-dot"></i>Revenue ${money(revenue)}</span><span><i class="legend-dot warn-dot"></i>Pending ${money(pending)}</span><span><i class="legend-dot bad-dot"></i>Overdue ${money(overdue)}</span></div></div></div>`}
function feeSummaryCards(fees){const s=feeSummary(fees);return `<div class="grid fee-grid"><div class="stat-card"><strong>${money(s.totalFee)}</strong><span>Total Fee</span></div><div class="stat-card"><strong>${money(s.totalPending)}</strong><span>Total Pending</span></div><div class="stat-card"><strong>${money(s.totalOverdue)}</strong><span>Total Overdue</span></div><div class="stat-card"><strong>${money(s.totalRevenue)}</strong><span>Total Revenue</span></div></div>`}


function setupScrollReveal(){
  const root=$('content');
  if(!root) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nodes = [...root.querySelectorAll('.hero-card,.grid,.card,.item,.search-card,.section-title,.list > .empty')];
  nodes.forEach((el,i)=>{
    if(el.closest('.quick-orbit-scene') || el.closest('.more-orbit-scene')) return;
    el.classList.add('scroll-reveal');
    el.style.setProperty('--reveal-delay', `${Math.min(i*34,170)}ms`);
    if(reduce) el.classList.add('revealed');
  });
  if(reduce) return;
  if(!('IntersectionObserver' in window)){nodes.forEach(el=>el.classList.add('revealed'));return;}
  const io = new IntersectionObserver((entries,observer)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('revealed');observer.unobserve(entry.target);}
    });
  },{threshold:.08,rootMargin:'0px 0px -6% 0px'});
  nodes.forEach(el=>io.observe(el));
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function nextFrame(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}

async function circularLoginReveal(sourceEl, switchScreens){
  if(switchScreens) await switchScreens();
}

$('loginForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const email=$('email').value.trim().toLowerCase();
  const password=$('password').value;
  const consent=$('legalConsent');
  const submitBtn=$('loginSubmitBtn');
  $('loginError').textContent='';
  if(!consent || !consent.checked){$('loginError').textContent='Please accept the Privacy Policy and Terms & Conditions before login.';toast('Accept policy and terms first');return;}
  try{
    if(!BACKEND_MODE||!supabaseClient) throw new Error('Backend mode is required. Check config.js Supabase URL and anon key.');
    if(submitBtn){submitBtn.disabled=true; submitBtn.textContent='Opening...';}
    const user=await backendLogin(email,password);
    state.currentUser=user;
    state.section='dashboard';
    await circularLoginReveal(submitBtn, async()=>{
      $('loginScreen').classList.remove('active');
      $('mainScreen').classList.add('active');
      render();
      setupOneSignalUser();
    });
    toast(`Welcome ${user.full_name}`);
  }catch(err){
    console.error(err);
    $('loginError').textContent=err.message||'Invalid login or inactive account.';
  }finally{
    if(submitBtn){submitBtn.textContent='Login'; submitBtn.disabled=!(consent&&consent.checked);}
  }
});
$('logoutBtn').addEventListener('click',async()=>{if(BACKEND_MODE&&supabaseClient){await supabaseClient.auth.signOut().catch(()=>{});}if(oneSignalReady()){window.OneSignalDeferred.push(async OneSignal=>{try{if(OneSignal.logout) await OneSignal.logout();}catch(e){}});}state.currentUser=null;$('mainScreen').classList.remove('active');$('loginScreen').classList.add('active');$('password').value='';const consent=$('legalConsent');const submit=$('loginSubmitBtn');if(consent) consent.checked=false;if(submit) submit.disabled=true;toast('Logged out')});

function navItems(){const role=state.currentUser.role;if(role==='admin')return [['dashboard','🏠','Home'],['students','🎓','Students'],['teachers','👨‍🏫','Teachers'],['batches','📚','Batches'],['more','☰','More']];if(role==='teacher')return [['dashboard','🏠','Home'],['students','🎓','Students'],['attendance','✅','Attend'],['materials','📄','Notes'],['more','☰','More']];return [['dashboard','🏠','Home'],['attendance','✅','Attend'],['fees','₹','Fees'],['materials','📄','Notes'],['more','☰','More']];}
function renderNav(){const nav=$('bottomNav');nav.innerHTML=navItems().map(([id,icon,label])=>`<button class="${state.section===id?'active':''}" onclick="go('${id}')"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('')}
window.go=(section)=>{if(!isAllowedSection(section)){toast('Access blocked for this role');state.section='dashboard';}else{state.section=section;}render();setTimeout(()=>{const shell=document.querySelector('.app-shell'); if(shell) shell.scrollTop=0; window.scrollTo({top:0,behavior:'smooth'});},0);};
function render(){if(!isAllowedSection(state.section))state.section='dashboard';renderNav();$('pageTitle').textContent=titleFor(state.section);$('roleLine').textContent=`${state.currentUser.full_name} • ${state.currentUser.role.toUpperCase()}`;const map={dashboard:renderDashboard,students:renderStudents,teachers:renderTeachers,batches:renderBatches,attendance:renderAttendance,fees:renderFees,notices:renderNotices,materials:renderMaterials,tests:renderTests,ai:renderAI,profile:renderProfile,more:renderMore};$('content').classList.remove('page-enter');void $('content').offsetWidth;$('content').classList.add('page-enter');try{$('content').innerHTML=(map[state.section]||renderDashboard)();}catch(err){console.error('Render failed:',err);$('content').innerHTML=`<div class="empty">This page had a render error. Please refresh or report: ${err.message||err}</div>`;}attachEvents();startPhoneSafeOrbit();setupScrollReveal();}


// Phone-safe real orbit animation
// CSS-only orbit was unreliable on some Android Chrome/WebView builds.
// This JS animation uses real pixel positions, so buttons stay visible and still orbit.
let msOrbitFrame = null;
function startPhoneSafeOrbit(){
  if(msOrbitFrame){ cancelAnimationFrame(msOrbitFrame); msOrbitFrame = null; }
  const quickScene = document.querySelector('.quick-orbit-scene');
  const moreScene = document.querySelector('.more-orbit-scene');
  if(!quickScene && !moreScene) return;
  if(quickScene) quickScene.classList.add('js-orbit-enabled');
  if(moreScene) moreScene.classList.add('js-orbit-enabled');
  // Keep the dashboard orbit moving on phones. Some Android/WebView devices report
  // prefers-reduced-motion and were freezing the orbit, so this local flag stays false.
  const prefersReduced = false;
  const placeItems = (scene, selector, speed, radiusScale, startOffset, staticOnly=false) => {
    if(!scene) return;
    const items = [...scene.querySelectorAll(selector)];
    if(!items.length) return;
    const rect = scene.getBoundingClientRect();
    const w = rect.width || scene.clientWidth || 320;
    const h = rect.height || scene.clientHeight || 320;
    const maxItemW = Math.max(...items.map(el => el.offsetWidth || 90));
    const maxItemH = Math.max(...items.map(el => el.offsetHeight || 44));
    const cx = w / 2;
    const cy = h / 2;
    const isMore = selector.includes('more-orbit-item');
    // Use an ellipse on phones: wider safe left/right spacing + taller orbit.
    // This prevents 7 More buttons from colliding on narrow screens.
    const safePad = isMore ? 18 : 16;
    const maxRx = Math.max(70, (w - maxItemW) / 2 - safePad);
    const maxRy = Math.max(82, (h - maxItemH) / 2 - safePad);
    const baseR = Math.min(w, h) * radiusScale;
    const rx = Math.max(isMore ? 92 : 88, Math.min(maxRx, baseR));
    const ry = Math.max(isMore ? 142 : 108, Math.min(maxRy, isMore ? baseR * 1.45 : baseR * 1.08));
    const now = staticOnly ? 0 : performance.now();
    items.forEach((el, i) => {
      const base = startOffset + (Math.PI * 2 * i / items.length);
      const angle = base + (prefersReduced ? 0 : now * speed);
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      // Important is required because older mobile CSS rules used !important.
      // Without this, Android keeps the old left/top values and the buttons overlap.
      el.style.setProperty('left', `${x}px`, 'important');
      el.style.setProperty('top', `${y}px`, 'important');
      el.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
      // Kill old CSS keyframe transforms. JS owns the orbit position.
      el.style.setProperty('animation', 'none', 'important');
      el.style.setProperty('filter', `drop-shadow(0 0 ${8 + (i % 3) * 2}px rgba(250,204,21,.22))`, 'important');
    });
  };
  const placeQuickActions = (scene, speed, startOffset) => {
    if(!scene) return;
    const items = [...scene.querySelectorAll('.quick-orbit-actions button')];
    if(!items.length) return;
    const rect = scene.getBoundingClientRect();
    const w = rect.width || scene.clientWidth || 320;
    const h = rect.height || scene.clientHeight || 340;
    const maxItemW = Math.max(...items.map(el => el.offsetWidth || 92));
    const maxItemH = Math.max(...items.map(el => el.offsetHeight || 40));
    // Home quick actions were flying outside on wide/desktop wrappers.
    // Use a fixed center + transform orbit with a capped radius instead of x/y pixel orbit.
    // This keeps every action inside the card on phone and desktop.
    const safeLimitX = Math.max(82, (w - maxItemW) / 2 - 20);
    const safeLimitY = Math.max(82, (h - maxItemH) / 2 - 20);
    const radius = Math.max(92, Math.min(126, safeLimitX, safeLimitY, Math.min(w, h) * 0.34));
    const now = prefersReduced ? 0 : performance.now();
    items.forEach((el, i) => {
      const angle = startOffset + (Math.PI * 2 * i / items.length) + now * speed;
      el.style.setProperty('left', '50%', 'important');
      el.style.setProperty('top', '50%', 'important');
      el.style.setProperty('transform', `translate(-50%, -50%) rotate(${angle}rad) translateY(-${radius}px) rotate(${-angle}rad)`, 'important');
      el.style.setProperty('animation', 'none', 'important');
      el.style.setProperty('filter', `drop-shadow(0 0 ${8 + (i % 3) * 2}px rgba(250,204,21,.22))`, 'important');
    });
  };
  const tick = () => {
    const hasOrbit = document.querySelector('.quick-orbit-scene,.more-orbit-scene');
    if(!hasOrbit){ msOrbitFrame = null; return; }
    placeQuickActions(document.querySelector('.quick-orbit-scene'), 0.00032, -Math.PI / 2);
    // More page already works well; keep its ellipse behavior unchanged.
    placeItems(document.querySelector('.more-orbit-scene'), '.more-orbit-item', 0.00022, 0.34, -Math.PI / 2);
    msOrbitFrame = requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
window.addEventListener('resize', () => {
  if(document.querySelector('.quick-orbit-scene,.more-orbit-scene')) startPhoneSafeOrbit();
});
window.addEventListener('orientationchange', () => setTimeout(startPhoneSafeOrbit, 250));
document.addEventListener('visibilitychange', () => { if(!document.hidden) setTimeout(startPhoneSafeOrbit, 120); });

function titleFor(s){return {dashboard:'Dashboard',students:'Students',teachers:'Teachers',batches:'Batches',attendance:'Attendance',fees:'Fees',notices:'Notices',materials:'Study Materials',tests:'Tests & Results',ai:'AI Assistance',profile:'Profile',more:'More'}[s]||'Dashboard'}
function iconFor(s){return {dashboard:'🏠',students:'🎓',teachers:'👨‍🏫',batches:'📚',attendance:'✅',fees:'₹',notices:'📢',materials:'📄',tests:'🧾',ai:'🤖',profile:'👤',more:'☰'}[s]||'•'}
function uniqueIds(ids){return [...new Set((ids||[]).filter(Boolean))]}
function batchIdsForStudent(studentId){const s=state.students.find(x=>x.id===studentId);return uniqueIds([...state.studentBatches.filter(x=>x.student_id===studentId).map(x=>x.batch_id), s?.batch_id]);}
function batchIdsForTeacher(teacherId){return uniqueIds([...state.teacherBatches.filter(x=>x.teacher_id===teacherId).map(x=>x.batch_id), ...state.batches.filter(b=>b.teacher_id===teacherId).map(b=>b.id)]);}
function batchNamesForStudent(studentId){const ids=batchIdsForStudent(studentId);return ids.map(batchName).join(', ') || 'No batch'}
function batchNamesForTeacher(teacherId){const ids=batchIdsForTeacher(teacherId);return ids.map(batchName).join(', ') || 'No batches'}
function teacherIdsForBatch(batchId){const b=state.batches.find(x=>x.id===batchId);return uniqueIds([...state.teacherBatches.filter(x=>x.batch_id===batchId).map(x=>x.teacher_id), b?.teacher_id]);}
function teacherNamesForBatch(batchId){const ids=teacherIdsForBatch(batchId);return ids.map(teacherName).join(', ') || 'Unassigned'}
function roleStudents(){const u=state.currentUser;if(u.role==='admin')return state.students;if(u.role==='teacher'){const t=currentTeacher();const batchIds=batchIdsForTeacher(t?.id);return state.students.filter(s=>batchIdsForStudent(s.id).some(id=>batchIds.includes(id)));}return state.students.filter(s=>s.profile_id===u.id||s.id===u.student_id)}
function studentsForBatch(batchId){const students=roleStudents().filter(s=>s.status==='active');if(!batchId)return students;return students.filter(s=>batchIdsForStudent(s.id).includes(batchId));}
function roleBatches(){const u=state.currentUser;if(u.role==='admin')return state.batches;if(u.role==='teacher'){const t=currentTeacher();const ids=batchIdsForTeacher(t?.id);return state.batches.filter(b=>ids.includes(b.id))}const s=state.students.find(x=>x.profile_id===u.id||x.id===u.student_id);const ids=batchIdsForStudent(s?.id);return state.batches.filter(b=>ids.includes(b.id))}
function assignedProfileIds(role){const rows=role==='teacher'?state.teachers:state.students;return rows.map(x=>x.profile_id).filter(Boolean)}
function unassignedProfiles(role){const assigned=new Set(assignedProfileIds(role));return state.users.filter(u=>u.role===role && (u.status||'active')==='active' && !assigned.has(u.id))}
function profileById(id){return state.users.find(u=>u.id===id)||null}

function renderDashboard(){const students=roleStudents();const batches=roleBatches();const today=new Date().toISOString().slice(0,10);const todaysAttendance=state.attendance.filter(a=>students.some(s=>s.id===a.student_id)&&a.date===today).length;const pending=state.fees.filter(f=>students.some(s=>s.id===f.student_id)&&f.status!=='paid').length;const roleMessage=state.currentUser.role==='teacher'?'Teacher fee tools are hidden. Use Attendance, Notes, Notices and Results.':state.currentUser.role==='student'?'Track your attendance, fees, materials and results from one focused control panel.':'Manage your coaching centre from this experimental cinematic dashboard.';const fourth=state.currentUser.role==='teacher'?`<div class="stat-card"><strong>${todaysAttendance}</strong><span>Today Attendance</span></div>`:`<div class="stat-card"><strong>${pending}</strong><span>Pending Fees</span></div>`;return `<div class="hero-card reel-hero"><div class="reel-hero-copy"><span class="reel-kicker">EXPERIMENTAL UI BRANCH</span><h3>Welcome back, ${state.currentUser.full_name}</h3><p>${roleMessage}</p><div class="reel-mini-row"><span>${students.length} students</span><span>${batches.length} batches</span><span>${state.currentUser.role.toUpperCase()}</span></div></div><div class="reel-hero-visual" aria-hidden="true"><span class="reel-orb-core"></span><span class="reel-orb-ring reel-ring-one"></span><span class="reel-orb-ring reel-ring-two"></span><span class="reel-orb-chip chip-a">LIVE</span><span class="reel-orb-chip chip-b">MS</span></div></div><div class="grid"><div class="stat-card"><strong>${students.length}</strong><span>Students</span></div><div class="stat-card"><strong>${state.currentUser.role==='student'?1:state.teachers.length}</strong><span>Teachers</span></div><div class="stat-card"><strong>${batches.length}</strong><span>Batches</span></div>${fourth}</div><div class="card quick-orbit-card"><div class="quick-orbit-scene"><div class="quick-orbit-ring"></div><div class="quick-orbit-center"><span>Quick</span><strong>Actions</strong></div><div class="quick-orbit-actions">${quickActions()}</div></div></div><h3 class="section-title">Recent Notices</h3><div class="list">${visibleNotices().slice(0,3).map(noticeCard).join('')||'<div class="empty">No notices yet.</div>'}</div>`}
function quickActions(){const r=state.currentUser.role;if(r==='admin')return `<button class="accent-btn" onclick="go('teachers')">Assign Teacher</button><button class="accent-btn" onclick="go('students')">Assign Student</button><button class="accent-btn" onclick="go('fees')">Fees</button><button class="accent-btn" onclick="go('notices')">Notice</button>`;if(r==='teacher')return `<button class="accent-btn" onclick="go('attendance')">Mark Attendance</button><button class="accent-btn" onclick="go('materials')">Add Material</button><button class="accent-btn" onclick="go('tests')">Results</button><button class="accent-btn" onclick="go('ai')">AI Assistance</button>`;return `<button class="accent-btn" onclick="go('materials')">Open Notes</button><button class="accent-btn" onclick="go('fees')">Fee Status</button><button class="accent-btn" onclick="go('tests')">Results</button><button class="accent-btn" onclick="go('ai')">AI Assistance</button>`}
function renderMore(){let items=state.currentUser.role==='admin'?['attendance','fees','notices','materials','tests','ai','profile']:state.currentUser.role==='teacher'?['batches','attendance','notices','materials','tests','ai','profile']:['attendance','fees','notices','materials','tests','ai','profile'];return `<div class="card more-orbit-card"><div class="more-orbit-scene" style="--count:${items.length}"><div class="more-orbit-ring more-ring-a"></div><div class="more-orbit-ring more-ring-b"></div><button class="more-orbit-logo" onclick="go('dashboard')" aria-label="Back to dashboard"><img src="assets/ms-logo.png" alt="MS logo"><span>More</span></button>${items.map((i,idx)=>`<button class="more-orbit-item more-pos-${idx+1}" onclick="go('${i}')"><span>${iconFor(i)}</span><strong>${titleFor(i)}</strong></button>`).join('')}</div></div>`}

function renderStudents(){const canManage=state.currentUser.role==='admin';const batches=roleBatches();const intro=state.currentUser.role==='teacher'?`<div class="card"><h3>Assigned students</h3><p class="small">Showing only students from your assigned batches: ${batches.map(b=>b.batch_name).join(', ')||'No assigned batches'}.</p></div>`:'';const cards=roleStudents().map(s=>searchable(`${s.name||''} ${s.email||''} ${s.phone||''} ${batchNamesForStudent(s.id)}`,`<div class="item"><h3>${s.name || '-'}</h3><p>Email: ${s.email || '-'}</p><p>Phone: ${s.phone || '-'}</p><p>Batches: ${batchNamesForStudent(s.id)}</p>${canManage?`<div class="actions"><button class="secondary-btn" onclick="editStudent('${s.id}')">Edit</button><button class="secondary-btn" onclick="assignStudentBatches('${s.id}')">Assign batches</button><button class="danger-btn" onclick="deleteStudent('${s.id}')">Delete</button></div>`:''}</div>`)).join('')||'<div class="empty">No students found for the assigned batches.</div>';return `${canManage?assignStudentForm():''}${intro}${searchBox('Search students by name, email, batch, phone...')}<div class="list two">${cards}</div>`}
function assignStudentForm(){const profiles=unassignedProfiles('student');return `<form id="studentAssignForm" class="card form-grid"><h3>Assign Student</h3><p class="small">Create the login user/profile in Supabase first, then assign details here.</p><select name="profile_id" required>${profiles.length?profiles.map(p=>`<option value="${p.id}">${p.full_name || p.email} • ${p.email}</option>`).join(''):'<option value="">No unassigned student profiles found</option>'}</select><input name="name" placeholder="Student name" required><input name="phone" placeholder="Phone"><input name="parent_name" placeholder="Parent name"><input name="parent_phone" placeholder="Parent phone"><input name="class_name" placeholder="Class">${batchCheckboxes('batch_ids')}<p class="small">Select one or more batches. This works properly on phones and laptops.</p><button class="primary-btn">Assign Student</button></form>`}

window.assignStudentBatches=async(id)=>{
  if(state.currentUser.role!=='admin'){toast('Only admin can assign student batches');return;}
  const student=state.students.find(x=>x.id===id); if(!student)return;
  const ids=promptBatchIds(batchIdsForStudent(id)); if(ids===null)return;
  try{await replaceStudentBatchAssignments(id,ids); if(BACKEND_MODE&&supabaseClient) await refreshAndRender('Student batches updated'); else{toast('Student batches updated');render();}}catch(err){console.error(err);toast(err.message||'Could not update student batches')}
}
window.editStudent=async(id)=>{if(state.currentUser.role!=='admin'){toast('Only admin can edit students');return;}const s=state.students.find(x=>x.id===id);if(!s)return;const name=prompt('Student name',s.name||'');if(name===null)return;const phone=prompt('Phone number',s.phone||'');if(phone===null)return;const parent_name=prompt('Parent name',s.parent_name||'');if(parent_name===null)return;const parent_phone=prompt('Parent phone',s.parent_phone||'');if(parent_phone===null)return;const class_name=prompt('Class',s.class_name||'');if(class_name===null)return;try{const row={name:name.trim()||s.name,phone:phone||null,parent_name:parent_name||null,parent_phone:parent_phone||null,class_name:class_name||null};if(BACKEND_MODE&&supabaseClient){await updateRow('students',id,row);if(s.profile_id) await updateRow('profiles',s.profile_id,{full_name:row.name,phone:row.phone}).catch(()=>{});await refreshAndRender('Student updated')}else{Object.assign(s,row);toast('Student updated');render()}}catch(err){console.error(err);toast(err.message||'Could not update student')}}
window.deleteStudent=async(id)=>{const s=state.students.find(x=>x.id===id);if(s&&confirm(`Permanently delete student "${s.name}" from the app? Related attendance/fees/results may also be removed by the database.`)){try{await deleteStudentRecord(id);await refreshAndRender('Student deleted');}catch(err){console.error(err);toast(err.message||'Could not delete student')}}}

function renderTeachers(){if(state.currentUser.role!=='admin')return '<div class="empty">Only admin can manage teachers.</div>';const cards=state.teachers.map(t=>searchable(`${t.name||''} ${t.email||''} ${t.phone||''} ${batchNamesForTeacher(t.id)}`,`<div class="item"><h3>${t.name || '-'}</h3><p>Email: ${t.email || '-'}</p><p>Phone: ${t.phone || '-'}</p><p>Batches: ${batchNamesForTeacher(t.id)}</p><div class="actions"><button class="secondary-btn" onclick="editTeacher('${t.id}')">Edit</button><button class="secondary-btn" onclick="assignTeacherBatches('${t.id}')">Assign batches</button><button class="danger-btn" onclick="deleteTeacher('${t.id}')">Delete</button></div></div>`)).join('')||'<div class="empty">No teachers found.</div>';return `${assignTeacherForm()}${searchBox('Search teachers by name, email, batch, phone...')}<div class="list two">${cards}</div>`}
function assignTeacherForm(){const profiles=unassignedProfiles('teacher');return `<form id="teacherAssignForm" class="card form-grid"><h3>Assign Teacher</h3><p class="small">Create the login user/profile in Supabase first, then assign teacher details here.</p><select name="profile_id" required>${profiles.length?profiles.map(p=>`<option value="${p.id}">${p.full_name || p.email} • ${p.email}</option>`).join(''):'<option value="">No unassigned teacher profiles found</option>'}</select><input name="name" placeholder="Teacher name" required><input name="phone" placeholder="Phone"><input name="subject" placeholder="Subject"><input name="qualification" placeholder="Qualification">${batchCheckboxes('batch_ids')}<p class="small">Optional: select one or more batches for this teacher.</p><button class="primary-btn">Assign Teacher</button></form>`}

window.assignTeacherBatches=async(id)=>{
  if(state.currentUser.role!=='admin'){toast('Only admin can assign teacher batches');return;}
  const teacher=state.teachers.find(x=>x.id===id); if(!teacher)return;
  const ids=promptBatchIds(batchIdsForTeacher(id)); if(ids===null)return;
  try{await replaceTeacherBatchAssignments(id,ids); if(BACKEND_MODE&&supabaseClient) await refreshAndRender('Teacher batches updated'); else{toast('Teacher batches updated');render();}}catch(err){console.error(err);toast(err.message||'Could not update teacher batches. Run the multiple-batch SQL first.')}
}
window.editTeacher=async(id)=>{if(state.currentUser.role!=='admin'){toast('Only admin can edit teachers');return;}const t=state.teachers.find(x=>x.id===id);if(!t)return;const name=prompt('Teacher name',t.name||'');if(name===null)return;const phone=prompt('Phone number',t.phone||'');if(phone===null)return;const subject=prompt('Subject',t.subject||'');if(subject===null)return;const qualification=prompt('Qualification',t.qualification||'');if(qualification===null)return;try{const row={name:name.trim()||t.name,phone:phone||null,subject:subject||null,qualification:qualification||null};if(BACKEND_MODE&&supabaseClient){await updateRow('teachers',id,row);if(t.profile_id) await updateRow('profiles',t.profile_id,{full_name:row.name,phone:row.phone}).catch(()=>{});await refreshAndRender('Teacher updated')}else{Object.assign(t,row);toast('Teacher updated');render()}}catch(err){console.error(err);toast(err.message||'Could not update teacher')}}
window.deleteTeacher=async(id)=>{const t=state.teachers.find(x=>x.id===id);if(t&&confirm(`Permanently delete teacher "${t.name}" from the app? Assigned batches/materials/tests will be detached from this teacher.`)){try{await deleteTeacherRecord(id);await refreshAndRender('Teacher deleted');}catch(err){console.error(err);toast(err.message||'Could not delete teacher')}}}

function renderBatches(){const canEdit=state.currentUser.role==='admin';const cards=roleBatches().map(b=>searchable(`${b.batch_name} ${b.class_name} ${b.subject} ${b.schedule} ${teacherNamesForBatch(b.id)} ${b.description} ${b.status}`,`<div class="item"><div class="row"><h3>${b.batch_name}</h3>${pillStatus(b.status)}</div><p>Class ${b.class_name} • ${b.subject}</p><p>${b.schedule}</p><p>Teacher: ${teacherNamesForBatch(b.id)}</p><p>${b.description||''}</p>${canEdit?`<div class="actions"><button class="danger-btn" onclick="deleteBatch('${b.id}')">Delete batch</button></div>`:''}</div>`)).join('')||'<div class="empty">No batches found.</div>';return `${canEdit?batchForm():''}${searchBox('Search batches by class, subject, teacher...')}<div class="list two">${cards}</div>`}
function batchForm(){return `<form id="batchForm" class="card form-grid"><h3>Add Batch</h3><input name="batch_name" placeholder="Batch name" required><input name="class_name" placeholder="Class"><input name="subject" placeholder="Subject"><input name="schedule" placeholder="Timing"><select name="teacher_id">${state.teachers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select><textarea name="description" placeholder="Description"></textarea><button class="primary-btn">Add Batch</button></form>`}
window.deleteBatch=async(id)=>{const b=state.batches.find(x=>x.id===id);if(b&&confirm(`Permanently delete batch "${b.batch_name}"? Students will be unassigned from this batch.`)){try{await deleteBatchRecord(id);await refreshAndRender('Batch deleted');}catch(err){console.error(err);toast(err.message||'Could not delete batch')}}}

function renderAttendance(){const students=roleStudents().filter(s=>s.status==='active');const canEdit=state.currentUser.role==='admin'||state.currentUser.role==='teacher';const records=state.attendance.filter(a=>students.some(s=>s.id===a.student_id));const cards=records.map(a=>searchable(`${studentName(a.student_id)} ${a.status} ${a.date} ${batchName(a.batch_id)} ${a.entry_time||''} ${a.exit_time||''} ${a.remarks}`,`<div class="item attendance-card"><div class="row"><h3>${studentName(a.student_id)}</h3>${pillStatus(a.status)}</div><p>${a.date} • ${batchName(a.batch_id)}</p><div class="time-row"><span>Entry: <strong>${timeText(a.entry_time)}</strong></span><span>Exit: <strong>${timeText(a.exit_time)}</strong></span></div><p>${a.remarks||''}</p>${canEdit?`<div class="actions"><button class="secondary-btn" onclick="editAttendance('${a.id}')">Edit time/status</button><button class="danger-btn" onclick="deleteAttendance('${a.id}')">Delete attendance</button></div>`:''}</div>`)).join('')||'<div class="empty">No attendance found.</div>';return `${canEdit?attendanceForm(students):''}${searchBox('Search attendance by student, date, status, entry, exit...')}<div class="list">${cards}</div>`}
function attendanceForm(students){const batches=roleBatches();if(!batches.length)return '<div class="empty">No batch assigned/created yet. Create or assign a batch before taking attendance.</div>';if(!students.length)return '<div class="empty">No active students available for these batches.</div>';return `<form id="attendanceForm" class="card form-grid"><h3>Mark Attendance</h3><label>Batch<select id="attendanceBatchSelect" name="batch_id" required>${batches.map(b=>`<option value="${b.id}">${b.batch_name}</option>`).join('')}</select></label><label>Search student<input type="search" class="select-search" data-select-filter="attendanceStudentSelect" placeholder="Search student by name, batch, class..."></label><label>Student<select id="attendanceStudentSelect" name="student_id" required>${students.map(s=>`<option value="${s.id}" data-batch-ids="${batchIdsForStudent(s.id).join(',')}" data-search="${`${s.name} ${s.email||''} ${s.class_name||''} ${batchNamesForStudent(s.id)} ${s.phone||''}`.toLowerCase()}">${s.name} • ${batchNamesForStudent(s.id)}</option>`).join('')}</select></label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"><div class="form-row"><label>Entry time<input name="entry_time" type="time"></label><label>Exit time<input name="exit_time" type="time"></label></div><select name="status"><option>present</option><option>absent</option><option>late</option></select><input name="remarks" placeholder="Remarks"><button class="primary-btn">Save Attendance</button><p class="small">Select batch first, then search and select a student from that batch.</p></form>`}
window.editAttendance=async(id)=>{if(!(state.currentUser.role==='admin'||state.currentUser.role==='teacher')){toast('Only admin/teacher can edit attendance');return}const rec=state.attendance.find(a=>a.id===id);if(!rec)return;const entry=prompt('Enter entry time in 24h format, example 08:05',rec.entry_time||'');if(entry===null)return;const exit=prompt('Enter exit time in 24h format, example 09:30',rec.exit_time||'');if(exit===null)return;const status=prompt('Status: present / absent / late',rec.status||'present');if(status===null)return;const remarks=prompt('Remarks',rec.remarks||'');const clean={entry_time:entry.trim(),exit_time:exit.trim(),status:['present','absent','late'].includes(status.trim().toLowerCase())?status.trim().toLowerCase():rec.status,remarks:remarks||''};try{if(BACKEND_MODE&&supabaseClient){await updateRow('attendance',id,clean);await refreshAndRender('Attendance updated');}else{Object.assign(rec,clean);toast('Attendance updated');render()}}catch(err){console.error(err);toast(err.message||'Could not update attendance')}}

window.deleteAttendance=async(id)=>{
  if(!(state.currentUser.role==='admin'||state.currentUser.role==='teacher')){toast('Only admin/teacher can delete attendance');return;}
  const rec=state.attendance.find(a=>a.id===id);
  if(!rec)return;
  if(!confirm(`Delete attendance for ${studentName(rec.student_id)} on ${rec.date}?`))return;
  try{
    if(BACKEND_MODE&&supabaseClient){await deleteRow('attendance',id);await refreshAndRender('Attendance deleted');}
    else{state.attendance=state.attendance.filter(x=>x.id!==id);toast('Attendance deleted');render()}
  }catch(err){console.error(err);toast(err.message||'Could not delete attendance')}
}

function renderFees(){if(state.currentUser.role==='teacher')return '<div class="empty">Fee section is hidden for teachers. Only admin and students can access fee details.</div>';const students=roleStudents();const fees=state.fees.filter(f=>students.some(s=>s.id===f.student_id));const cards=fees.map(f=>searchable(`${studentName(f.student_id)} ${f.amount} ${f.fee_type} ${f.status} ${f.due_date} ${f.payment_date} ${f.remarks}`,`<div class="item"><div class="row"><h3>${studentName(f.student_id)}</h3>${pillStatus(f.status)}</div><p>${money(f.amount)} • ${f.fee_type}</p><p>Paid amount: ${money(feePaidAmount(f))}</p><p>Due: ${f.due_date || '-'} • Paid date: ${f.payment_date || '-'}</p><p>${f.remarks||''}</p>${state.currentUser.role==='admin'?`<div class="actions"><button class="danger-btn" onclick="deleteFee('${f.id}')">Delete fee</button></div>`:''}</div>`)).join('')||'<div class="empty">No fee records.</div>';return `${state.currentUser.role!=='student'?feeForm(students):''}${feeSummaryCards(fees)}${feeChart(fees)}${searchBox('Search fees by student, status, amount, due date...')}<div class="list">${cards}</div>`}
window.deleteFee=async(id)=>{
  if(state.currentUser.role!=='admin'){toast('Only admin can delete fee records');return;}
  if(!confirm('Delete this fee record?'))return;
  try{
    if(BACKEND_MODE&&supabaseClient){await deleteRow('fees',id);await refreshAndRender('Fee deleted');}
    else{state.fees=state.fees.filter(x=>x.id!==id);toast('Fee deleted');render()}
  }catch(err){console.error(err);toast(err.message||'Could not delete fee')}
}
function feeForm(students){return `<form id="feeForm" class="card form-grid"><h3>Add Fee</h3><label>Search student<input type="search" class="select-search" data-select-filter="feeStudentSelect" placeholder="Search student by name, batch, class..."></label><select id="feeStudentSelect" name="student_id">${students.map(s=>`<option value="${s.id}" data-search="${`${s.name} ${s.email||''} ${s.class_name||''} ${batchNamesForStudent(s.id)} ${s.phone||''}`.toLowerCase()}">${s.name} • ${batchNamesForStudent(s.id)}</option>`).join('')}</select><input name="amount" type="number" placeholder="Total fee amount" required><input name="paid_amount" type="number" placeholder="Paid amount, optional" value="0"><input name="fee_type" placeholder="Fee type" value="Monthly"><input name="due_date" type="date"><select name="status"><option>pending</option><option>paid</option><option>partial</option><option>overdue</option></select><input name="remarks" placeholder="Remarks"><button class="primary-btn">Save Fee</button></form>`}

function visibleNotices(){const u=state.currentUser;if(u.role==='admin')return state.notices;const batches=roleBatches().map(b=>b.id);return state.notices.filter(n=>n.target==='all'||n.target===u.role+'s'||(n.target==='batch'&&batches.includes(n.batch_id)))}
function noticeCard(n){const canManage=state.currentUser.role==='admin'||state.currentUser.role==='teacher';return `<div class="item"><div class="row"><h3>${n.title}</h3><span class="pill ${n.priority==='urgent'?'bad':n.priority==='important'?'warn':''}">${n.priority}</span></div><p>${n.body}</p><p>${n.target}${n.batch_id?' • '+batchName(n.batch_id):''}</p>${canManage?`<div class="actions"><button class="danger-btn" onclick="deleteNotice('${n.id}')">Delete notice</button></div>`:''}</div>`}
window.deleteNotice=async(id)=>{
  if(!(state.currentUser.role==='admin'||state.currentUser.role==='teacher')){toast('Only admin/teacher can delete notices');return;}
  if(!confirm('Delete this notice?'))return;
  try{
    if(BACKEND_MODE&&supabaseClient){await deleteRow('notices',id);await refreshAndRender('Notice deleted');}
    else{state.notices=state.notices.filter(x=>x.id!==id);toast('Notice deleted');render()}
  }catch(err){console.error(err);toast(err.message||'Could not delete notice')}
}
function renderNotices(){const cards=visibleNotices().map(n=>searchable(`${n.title} ${n.body} ${n.priority} ${n.target} ${batchName(n.batch_id)}`,noticeCard(n))).join('')||'<div class="empty">No notices.</div>';return `${state.currentUser.role!=='student'?noticeForm():''}${searchBox('Search notices by title, priority, batch...')}<div class="list">${cards}</div>`}
function noticeForm(){return `<form id="noticeForm" class="card form-grid"><h3>Create Notice</h3><input name="title" placeholder="Title" required><textarea name="body" placeholder="Message" required></textarea><select name="priority"><option>normal</option><option>important</option><option>urgent</option></select><select name="target"><option>all</option><option>students</option><option>teachers</option><option>batch</option></select><select name="batch_id"><option value="">No batch</option>${roleBatches().map(b=>`<option value="${b.id}">${b.batch_name}</option>`).join('')}</select><button class="primary-btn">Create Notice</button></form>`}

function roleMaterials(){const batches=roleBatches().map(b=>b.id);if(state.currentUser.role==='admin')return state.materials;return state.materials.filter(m=>batches.includes(m.batch_id)||!m.batch_id)}
function renderMaterials(){const canManage=state.currentUser.role==='admin'||state.currentUser.role==='teacher';const visible=roleMaterials();const cards=visible.map(m=>{const actionLabel=materialActionLabel(m);const actionBtn=`<button class="primary-btn" onclick="downloadMaterial('${m.id}')">${actionLabel}</button>`;return searchable(`${m.title} ${m.subject} ${batchName(m.batch_id)} ${m.description} ${m.file_type} ${m.file_size} ${m.created_at}`,`<div class="item"><div class="row"><h3>${m.title}</h3><span class="pill">${m.file_type}</span></div><p>${m.subject || '-'} • ${batchName(m.batch_id)}</p><p>${m.description || ''}</p><p>${m.file_size || '-'} • ${m.created_at || '-'}</p><div class="actions">${actionBtn}${canManage?`<button class="danger-btn" onclick="deleteMaterial('${m.id}')">Delete</button>`:''}</div><p class="small">Tap once to download this file to your device.</p></div>`)}).join('')||'<div class="empty">No study material available for your assigned batch.</div>';const help=state.currentUser.role==='student'?`<div class="card"><p class="small">Only materials uploaded for your assigned batch are shown here. If this is empty, ask admin to check your batch assignment and the material batch.</p></div>`:'';return `${state.currentUser.role!=='student'?materialForm():help}${searchBox('Search materials by title, subject, batch...')}<div class="list two">${cards}</div>`}
function materialForm(){return `<form id="materialForm" class="card form-grid"><h3>Upload Study Material</h3><input name="title" placeholder="Title" required><input name="subject" placeholder="Subject"><textarea name="description" placeholder="Description"></textarea><select name="batch_id">${roleBatches().map(b=>`<option value="${b.id}">${b.batch_name}</option>`).join('')}</select><label class="file-picker"><span>Choose PDF / file from device</span><input type="file" name="material_file" accept="application/pdf,.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" required></label><p id="selectedFileName" class="small">No file selected.</p><button class="primary-btn">Upload Material</button><p class="small">Files upload to Cloudinary in backend mode. PDFs/DOC/PPT use one device-download button instead of Cloudinary preview.</p></form>`}

window.deleteMaterial=async(id)=>{
  if(!(state.currentUser.role==='admin'||state.currentUser.role==='teacher')){toast('Only admin/teacher can delete material');return;}
  const m=state.materials.find(x=>x.id===id);
  if(!m)return;
  if(!confirm(`Delete study material "${m.title}"? This removes the record from the app. Cloudinary file deletion requires server-side API secret, so it will not be deleted from Cloudinary.`))return;
  try{
    if(BACKEND_MODE&&supabaseClient){await deleteRow('study_materials',id);await refreshAndRender('Study material deleted');}
    else{state.materials=state.materials.filter(x=>x.id!==id);toast('Study material deleted');render()}
  }catch(err){console.error(err);toast(err.message||'Could not delete material')}
}

function renderTests(){const students=roleStudents();const batches=roleBatches().map(b=>b.id);const tests=state.currentUser.role==='admin'?state.tests:state.tests.filter(t=>batches.includes(t.batch_id));const results=state.results.filter(r=>students.some(s=>s.id===r.student_id));const testCards=tests.map(t=>searchable(`${t.title} ${t.subject} ${batchName(t.batch_id)} ${t.test_date} ${t.total_marks}`,`<div class="item"><h3>${t.title}</h3><p>${t.subject} • ${batchName(t.batch_id)} • ${t.test_date}</p><p>Total: ${t.total_marks}</p>${state.currentUser.role!=='student'?`<div class="actions"><button class="danger-btn" onclick="deleteTest('${t.id}')">Delete test</button></div>`:''}</div>`)).join('');const resultCards=results.map(r=>{const t=state.tests.find(x=>x.id===r.test_id);return searchable(`${studentName(r.student_id)} ${t?.title} ${r.marks_obtained} ${t?.total_marks} ${r.remarks}`,`<div class="item"><div class="row"><h3>${studentName(r.student_id)}</h3><span class="pill ok">${r.marks_obtained}/${t?.total_marks||'-'}</span></div><p>${t?.title||'Test'}</p><p>${r.remarks||''}</p>${state.currentUser.role!=='student'?`<div class="actions"><button class="danger-btn" onclick="deleteResult('${r.id}')">Delete result</button></div>`:''}</div>`)}).join('')||'<div class="empty">No results.</div>';return `${state.currentUser.role!=='student'?testResultForm(students,tests):''}${searchBox('Search tests/results by student, subject, marks...')}<h3 class="section-title">Tests</h3><div class="list">${testCards}</div><h3 class="section-title">Results</h3><div class="list">${resultCards}</div>`}
window.deleteTest=async(id)=>{if(state.currentUser.role==='student'){toast('Students cannot delete tests');return;}if(!confirm('Delete this test?'))return;try{if(BACKEND_MODE&&supabaseClient){await deleteRow('tests',id);await refreshAndRender('Test deleted');}else{state.tests=state.tests.filter(x=>x.id!==id);state.results=state.results.filter(x=>x.test_id!==id);toast('Test deleted');render()}}catch(err){console.error(err);toast(err.message||'Could not delete test')}}
window.deleteResult=async(id)=>{if(state.currentUser.role==='student'){toast('Students cannot delete results');return;}if(!confirm('Delete this result?'))return;try{if(BACKEND_MODE&&supabaseClient){await deleteRow('test_results',id);await refreshAndRender('Result deleted');}else{state.results=state.results.filter(x=>x.id!==id);toast('Result deleted');render()}}catch(err){console.error(err);toast(err.message||'Could not delete result')}}
function testResultForm(students,tests){return `<form id="resultForm" class="card form-grid"><h3>Add Result</h3><select name="test_id">${tests.map(t=>`<option value="${t.id}">${t.title}</option>`).join('')}</select><label>Search student<input type="search" class="select-search" data-select-filter="resultStudentSelect" placeholder="Search student by name, batch, class..."></label><select id="resultStudentSelect" name="student_id">${students.map(s=>`<option value="${s.id}" data-search="${`${s.name} ${s.email||''} ${s.class_name||''} ${batchNamesForStudent(s.id)} ${s.phone||''}`.toLowerCase()}">${s.name} • ${batchNamesForStudent(s.id)}</option>`).join('')}</select><input name="marks_obtained" type="number" placeholder="Marks"><input name="remarks" placeholder="Remarks"><button class="primary-btn">Save Result</button></form>`}
function renderAI(){const links=[['ChatGPT','https://chatgpt.com'],['Gemini','https://gemini.google.com'],['NotebookLM','https://notebooklm.google.com'],['Perplexity','https://www.perplexity.ai']];return `<div class="card"><h3>AI Assistance</h3><div class="ai-grid">${links.map(([n,u])=>`<a class="link-btn" href="${u}" target="_blank">${n}</a>`).join('')}</div></div>`}
function renderProfile(){const u=state.currentUser;return `<div class="card"><h3>${u.full_name}</h3><p>${u.email}</p><p>Role: <strong>${u.role.toUpperCase()}</strong></p><p>Status: ${pillStatus(u.status)}</p><p class="small">Backend-connected mode. Use accounts created in Supabase Authentication.</p><div class="actions"><button class="accent-btn" onclick="enablePushNotifications()">Enable Notifications</button><button class="primary-btn" onclick="$('logoutBtn').click()">Logout</button></div><p class="small">Allow notifications to receive notice, attendance, fee and study-material alerts on this device.</p></div>`}

function formData(form){return Object.fromEntries(new FormData(form).entries())}
function selectedValues(form,name){
  const checkedInputs=[...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i=>i.value).filter(Boolean);
  const selectedOptions=[...form.querySelectorAll(`select[name="${name}"] option:checked`)].map(o=>o.value).filter(Boolean);
  return uniqueIds([...checkedInputs,...selectedOptions]);
}
function batchCheckboxes(name,currentIds=[]){
  const current=new Set(currentIds||[]);
  if(!state.batches.length) return '<div class="empty mini-empty">No batches created yet. Create batches first.</div>';
  return `<div class="batch-check-grid">${state.batches.map(b=>`<label class="batch-check"><input type="checkbox" name="${name}" value="${b.id}" ${current.has(b.id)?'checked':''}><span>${b.batch_name}</span></label>`).join('')}</div>`;
}
async function replaceStudentBatchAssignments(studentId,batchIds){
  const ids=uniqueIds(batchIds);
  const primary=ids[0] || null;
  if(!primary){ throw new Error('Select at least one batch for this student.'); }
  if(BACKEND_MODE&&supabaseClient){
    let savedPrimary=false;
    let savedMulti=false;
    let lastError=null;
    try{
      await updateRow('students',studentId,{batch_id:primary});
      savedPrimary=true;
    }catch(err){
      lastError=err;
      console.warn('Primary student batch update failed:', err.message||err);
    }
    try{
      await deleteWhere('student_batches','student_id',studentId);
      if(ids.length){
        await upsertRows('student_batches', ids.map(batch_id=>({student_id:studentId,batch_id})), 'student_id,batch_id');
      }
      savedMulti=true;
    }catch(err){
      lastError=err;
      console.warn('student_batches save failed:', err.message||err);
    }
    if(!savedPrimary && !savedMulti){
      throw new Error((lastError?.message || 'Student batch assignment failed') + ' — run the batch assignment SQL/RLS fix in Supabase.');
    }
    return {savedPrimary,savedMulti};
  }
  const s=state.students.find(x=>x.id===studentId); if(s) s.batch_id=primary;
  state.studentBatches=state.studentBatches.filter(x=>x.student_id!==studentId);
  ids.forEach(batch_id=>state.studentBatches.push({id:uid('sb'),student_id:studentId,batch_id}));
  return {savedPrimary:true,savedMulti:true};
}
async function replaceTeacherBatchAssignments(teacherId,batchIds){
  const ids=uniqueIds(batchIds);
  if(BACKEND_MODE&&supabaseClient){
    // Keep backward compatibility with the old batches.teacher_id column.
    await updateWhere('batches',{teacher_id:null},'teacher_id',teacherId).catch(()=>{});
    for(const batch_id of ids){await updateRow('batches',batch_id,{teacher_id:teacherId}).catch(()=>{});}
    try{
      await deleteWhere('teacher_batches','teacher_id',teacherId).catch(()=>{});
      if(ids.length){
        await upsertRows('teacher_batches', ids.map(batch_id=>({teacher_id:teacherId,batch_id})), 'teacher_id,batch_id');
      }
    }catch(err){
      throw new Error((err.message||'Teacher batch assignment failed') + ' — run MULTIPLE_BATCH_ASSIGNMENT_UPDATE.sql in Supabase SQL Editor.');
    }
  }else{
    state.batches=state.batches.map(b=>ids.includes(b.id)?{...b,teacher_id:teacherId}:b.teacher_id===teacherId?{...b,teacher_id:null}:b);
    state.teacherBatches=state.teacherBatches.filter(x=>x.teacher_id!==teacherId);
    ids.forEach(batch_id=>state.teacherBatches.push({id:uid('tb'),teacher_id:teacherId,batch_id}));
  }
}
function promptBatchIds(currentIds){
  const list=state.batches.map((b,i)=>`${i+1}. ${b.batch_name}`).join('\n');
  const currentNumbers=state.batches.map((b,i)=>currentIds.includes(b.id)?i+1:null).filter(Boolean).join(',');
  const input=prompt(`Enter batch numbers separated by comma:\n${list}`, currentNumbers);
  if(input===null)return null;
  return uniqueIds(input.split(',').map(x=>state.batches[Number(x.trim())-1]?.id));
}
function asNull(v){return v === '' || v === undefined ? null : v}
function activeTeacherId(){return currentTeacher()?.id || null}
function setupSearchableSelects(){document.querySelectorAll('[data-select-filter]').forEach(input=>{const sel=$(input.dataset.selectFilter);if(!sel||sel.dataset.searchReady)return;sel.dataset.searchReady='1';const apply=()=>{const q=(input.value||'').trim().toLowerCase();let first='';[...sel.options].forEach(opt=>{const text=(opt.dataset.search||opt.textContent||'').toLowerCase();const show=!q||text.includes(q);opt.hidden=!show;opt.disabled=!show;if(show&&!first)first=opt.value;});if(sel.selectedOptions[0]?.disabled){sel.value=first||'';}};input.addEventListener('input',apply);apply();});}
function setupAttendanceBatchStudentFilter(){const batchSel=$('attendanceBatchSelect');const studentSel=$('attendanceStudentSelect');if(!batchSel||!studentSel)return;const search=document.querySelector('[data-select-filter="attendanceStudentSelect"]');const all=[...studentSel.options].map(opt=>({value:opt.value,text:opt.textContent||'',batchIds:(opt.dataset.batchIds||'').split(',').filter(Boolean),search:(opt.dataset.search||opt.textContent||'').toLowerCase()}));const apply=()=>{const batchId=batchSel.value;const q=(search?.value||'').trim().toLowerCase();const matches=all.filter(opt=>(!batchId||opt.batchIds.includes(batchId))&&(!q||opt.search.includes(q)));studentSel.innerHTML=matches.length?matches.map(opt=>`<option value="${opt.value}" data-batch-ids="${opt.batchIds.join(',')}" data-search="${opt.search.replace(/"/g,'&quot;')}">${opt.text}</option>`).join(''):'<option value="">No matching student in this batch</option>';studentSel.disabled=!matches.length;};batchSel.onchange=apply;if(search)search.oninput=apply;apply();}
function attachEvents(){
  attachSearch();
  setupSearchableSelects();
  setupAttendanceBatchStudentFilter();
  const sf=$('studentAssignForm'); if(sf) sf.onsubmit=async e=>{e.preventDefault();const d=formData(sf);const profile=profileById(d.profile_id);if(!profile){toast('Select a student profile created in Supabase first');return;}try{const batchIds=selectedValues(sf,'batch_ids');if(!batchIds.length){toast('Select at least one batch before assigning student');return;}const row={profile_id:d.profile_id,email:profile.email,name:d.name,phone:d.phone||null,parent_name:d.parent_name||null,parent_phone:d.parent_phone||null,class_name:d.class_name||null,batch_id:batchIds[0]||null,status:'active',admission_date:new Date().toISOString().slice(0,10),created_by_teacher_id:null};if(BACKEND_MODE&&supabaseClient){let created=null;try{created=await insertRow('students',row);}catch(insertErr){const existing=state.students.find(s=>s.profile_id===d.profile_id||s.email===profile.email);if(!existing)throw insertErr;await updateRow('students',existing.id,row);created={...existing,...row};}let multiOk=true;try{const saved=await replaceStudentBatchAssignments(created.id,batchIds);multiOk=Boolean(saved?.savedMulti);}catch(batchErr){multiOk=false;console.warn('Extra student batch mapping failed after primary batch save:',batchErr.message||batchErr);}await updateRow('profiles',d.profile_id,{full_name:d.name,phone:d.phone||null}).catch(()=>{});await refreshAndRender(multiOk?'Student assigned to selected batches':'Student assigned to primary batch. Multiple-batch mapping needs SQL/RLS fix.');}else{const local={id:uid('s'),...row};state.students.unshift(local);await replaceStudentBatchAssignments(local.id,batchIds);toast('Student assigned to selected batches');render()}}catch(err){console.error(err);toast(err.message||'Could not assign student')}};
  const tf=$('teacherAssignForm'); if(tf) tf.onsubmit=async e=>{e.preventDefault();const d=formData(tf);const profile=profileById(d.profile_id);if(!profile){toast('Select a teacher profile created in Supabase first');return;}try{const batchIds=selectedValues(tf,'batch_ids');if(!batchIds.length){toast('Select at least one batch before assigning teacher');return;}const row={profile_id:d.profile_id,email:profile.email,name:d.name,phone:d.phone||null,subject:d.subject||null,qualification:d.qualification||null,status:'active'};if(BACKEND_MODE&&supabaseClient){const created=await insertRow('teachers',row);await replaceTeacherBatchAssignments(created.id,batchIds);await updateRow('profiles',d.profile_id,{full_name:d.name,phone:d.phone||null}).catch(()=>{});await refreshAndRender('Teacher assigned to selected batches');}else{const local={id:uid('t'),...row};state.teachers.unshift(local);await replaceTeacherBatchAssignments(local.id,batchIds);toast('Teacher assigned to selected batches');render()}}catch(err){console.error(err);toast(err.message||'Could not assign teacher')}};
  const bf=$('batchForm'); if(bf) bf.onsubmit=async e=>{e.preventDefault();const d=formData(bf);try{if(BACKEND_MODE&&supabaseClient){const created=await insertRow('batches',{batch_name:d.batch_name,class_name:d.class_name||null,subject:d.subject||null,schedule:d.schedule||null,teacher_id:asNull(d.teacher_id),description:d.description||null,status:'active'});if(d.teacher_id){await insertRow('teacher_batches',{teacher_id:d.teacher_id,batch_id:created.id}).catch(()=>{});}await refreshAndRender('Batch added');}else{const local={id:uid('b'),status:'active',...d};state.batches.unshift(local);if(d.teacher_id)state.teacherBatches.push({id:uid('tb'),teacher_id:d.teacher_id,batch_id:local.id});toast('Batch added');render()}}catch(err){console.error(err);toast(err.message||'Could not add batch')}};
  const af=$('attendanceForm'); if(af) af.onsubmit=async e=>{e.preventDefault();const d=formData(af);const s=state.students.find(x=>x.id===d.student_id);const selectedBatch=d.batch_id||null;if(!selectedBatch){toast('Select a batch first');return;}if(!s||!batchIdsForStudent(s.id).includes(selectedBatch)){toast('Select a student assigned to the selected batch');return;}const b=state.batches.find(x=>x.id===selectedBatch);const row={student_id:asNull(d.student_id),batch_id:selectedBatch,teacher_id:teacherIdsForBatch(selectedBatch)[0]||b?.teacher_id||activeTeacherId(),date:d.date,status:d.status,entry_time:d.entry_time||'',exit_time:d.exit_time||'',remarks:d.remarks||''};try{if(BACKEND_MODE&&supabaseClient){await insertRow('attendance',row);await refreshAndRender('Attendance saved');}else{state.attendance.unshift({id:uid('a'),...row});toast('Attendance saved');render()}}catch(err){console.error(err);toast(err.message||'Could not save attendance')}};
  const ff=$('feeForm'); if(ff) ff.onsubmit=async e=>{e.preventDefault();const d=formData(ff);const row={student_id:asNull(d.student_id),amount:Number(d.amount||0),paid_amount:d.status==='paid'?Number(d.amount||0):Number(d.paid_amount||0),fee_type:d.fee_type||null,due_date:d.due_date||null,payment_date:d.status==='paid'?new Date().toISOString().slice(0,10):null,status:d.status,remarks:d.remarks||''};try{if(BACKEND_MODE&&supabaseClient){await insertRow('fees',row);await refreshAndRender('Fee saved');}else{state.fees.unshift({id:uid('f'),...row});toast('Fee saved');render()}}catch(err){console.error(err);toast(err.message||'Could not save fee')}};
  const nf=$('noticeForm'); if(nf) nf.onsubmit=async e=>{e.preventDefault();const d=formData(nf);const row={title:d.title,body:d.body,priority:d.priority,target:d.target,batch_id:asNull(d.batch_id),created_by_profile_id:state.currentUser.id};try{if(BACKEND_MODE&&supabaseClient){await insertRow('notices',row);await refreshAndRender('Notice created');}else{state.notices.unshift({id:uid('n'),created_by:state.currentUser.id,created_at:new Date().toISOString().slice(0,10),...d});toast('Notice created');render()}}catch(err){console.error(err);toast(err.message||'Could not create notice')}};
  const mf=$('materialForm'); if(mf){const fileInput=mf.querySelector('input[name="material_file"]');const fileName=$('selectedFileName');if(fileInput&&fileName){fileInput.onchange=()=>{const file=fileInput.files[0];fileName.textContent=file?`Selected: ${file.name} (${formatBytes(file.size)})`:'No file selected.'}}mf.onsubmit=async e=>{e.preventDefault();const file=fileInput?.files?.[0];if(!file){toast('Select a file first');return}const submitBtn=mf.querySelector('button[type="submit"],button.primary-btn');const oldText=submitBtn?submitBtn.textContent:'';if(submitBtn){submitBtn.disabled=true;submitBtn.textContent=BACKEND_MODE?'Uploading to Cloudinary...':'Uploading demo file...'}try{const d=formData(mf);delete d.material_file;const b=state.batches.find(x=>x.id===d.batch_id);let fileUrl=URL.createObjectURL(file);let cloudinaryPublicId='';let fileType=(file.name.split('.').pop()||file.type||'FILE').toUpperCase();let fileSize=formatBytes(file.size);if(BACKEND_MODE){const uploaded=await uploadFileToCloudinary(file);fileUrl=uploaded.secure_url;cloudinaryPublicId=uploaded.public_id;fileType=(uploaded.format||fileType).toUpperCase();fileSize=formatBytes(uploaded.bytes||file.size);if(!d.batch_id){throw new Error('Select a batch before uploading study material. Students only receive material through their assigned batch.');}await insertRow('study_materials',{title:d.title,description:d.description||'',subject:d.subject||'',batch_id:asNull(d.batch_id),teacher_id:b?.teacher_id||activeTeacherId(),uploaded_by_profile_id:state.currentUser.id,cloudinary_url:fileUrl,cloudinary_public_id:cloudinaryPublicId,file_type:fileType,file_size:fileSize});await refreshAndRender('Uploaded. Students in this batch can download it on their device.');return}
state.materials.unshift({id:uid('m'),teacher_id:b?.teacher_id||'',uploaded_by:state.currentUser.id,file_url:fileUrl,cloudinary_public_id:cloudinaryPublicId,file_name:file.name,file_type:fileType,file_size:fileSize,created_at:new Date().toISOString().slice(0,10),...d});toast('Study material uploaded in demo mode');render()}catch(err){console.error(err);toast(err.message||'Upload failed')}finally{if(submitBtn){submitBtn.disabled=false;submitBtn.textContent=oldText||'Upload Material'}}}};
  const rf=$('resultForm'); if(rf) rf.onsubmit=async e=>{e.preventDefault();const d=formData(rf);const row={test_id:asNull(d.test_id),student_id:asNull(d.student_id),marks_obtained:Number(d.marks_obtained||0),remarks:d.remarks||''};try{if(BACKEND_MODE&&supabaseClient){await insertRow('test_results',row);await refreshAndRender('Result saved');}else{state.results.unshift({id:uid('r'),...row});toast('Result saved');render()}}catch(err){console.error(err);toast(err.message||'Could not save result')}};
}

// Auto session restore intentionally disabled.
// Reason: this coaching app should not open Admin/Teacher/Student dashboard without fresh login.
// Supabase can remember previous sessions by default; persistSession:false above and this disabled block prevent that.
