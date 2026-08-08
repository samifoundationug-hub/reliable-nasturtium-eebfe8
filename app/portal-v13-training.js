'use strict';

const TRAIN_MANAGER_ROLES=[ROLE.ED,ROLE.TRAIN];
const TRAIN_SESSION_ROLES=[ROLE.ED,ROLE.TRAIN,ROLE.SEC];
for(const r of Object.keys(ROLE_PAGES)){
  const pages=ROLE_PAGES[r];
  if(!pages.includes('training')){
    const i=pages.indexOf('ai');
    if(i>=0) pages.splice(i,0,'training'); else pages.push('training');
  }
}
PAGE_LABELS.training='Training';

let trainingCourses=[],trainingCourseRoles=[],trainingAssignments=[],trainingSessions=[],trainingAttendance=[],trainingProfiles=[];
const trainingCourseMap=()=>Object.fromEntries(trainingCourses.map(x=>[x.id,x]));
const canManageTraining=()=>hasAny(TRAIN_MANAGER_ROLES);
const canManageTrainingSessions=()=>hasAny(TRAIN_SESSION_ROLES);
const todayISO=()=>new Date().toISOString().slice(0,10);
function trainingOverdue(a){return !!a.due_date && a.due_date<todayISO() && !['Completed','Exempt','Cancelled'].includes(a.status)}
function trainingVerified(a){return a.status==='Completed'&&!!a.verified_at}
function pct(n,d){return d?Math.round(n*100/d):0}
function safeUrl(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch(_){return''}}
function trainingBadge(a){if(trainingVerified(a))return'<span class="badge">Verified</span>';if(a.status==='Completed')return'<span class="badge warn">Awaiting verification</span>';if(trainingOverdue(a))return'<span class="badge bad">Overdue</span>';return badge(a.status)}
function progressBar(v){const n=Math.max(0,Math.min(100,Number(v||0)));return `<div class="trainProgress"><i style="width:${n}%"></i></div><div class="meta">${n}% complete</div>`}
function hours(v){const n=Number(v||0);return Number.isInteger(n)?String(n):n.toFixed(1)}

const v13BaseLoadAll=loadAll;
loadAll=async function(){await v13BaseLoadAll();if(allowedPages().includes('training'))await loadTraining()};
const v13BaseLoadPage=loadPage;
loadPage=async function(p){if(p==='training')return loadTraining();return v13BaseLoadPage(p)};
const v13BaseLoadDashboard=loadDashboard;
loadDashboard=async function(){await v13BaseLoadDashboard();await loadTrainingDashboardMetric()};

async function loadTrainingDashboardMetric(){
  const el=$('mTrainingDue');if(!el||!user)return;
  const r=await db.from('training_assignments').select('id,due_date,status,user_id').eq('user_id',user.id);
  if(r.error){el.textContent='—';return}
  el.textContent=(r.data||[]).filter(trainingOverdue).length;
}

async function loadTraining(){
  const profilePromise=canManageTraining()||has(ROLE.SEC)
    ?db.from('profiles').select('id,full_name,role,is_active').eq('is_active',true).order('full_name')
    :Promise.resolve({data:[],error:null});
  const [c,cr,a,s,att,pr]=await Promise.all([
    db.from('training_courses').select('id,title,description,provider,category,delivery_mode,external_url,duration_hours,pass_mark,is_active,created_by,created_at,updated_at').order('title'),
    db.from('training_course_roles').select('course_id,role_name,is_mandatory,target_days'),
    db.from('training_assignments').select('id,course_id,user_id,assigned_by,assigned_at,due_date,is_required,status,progress_percent,started_at,completed_at,score,notes,evidence_path,certificate_path,certificate_issued_at,verified_by,verified_at,verification_notes,updated_at').order('due_date',{ascending:true}),
    db.from('training_sessions').select('id,course_id,title,session_date,end_at,delivery_mode,facilitator,meeting_url,location,notes,created_by,created_at').order('session_date',{ascending:false}).limit(40),
    db.from('training_attendance').select('session_id,user_id,status,attended_minutes,notes,marked_by,marked_at'),
    profilePromise
  ]);
  const firstErr=[c,cr,a,s,att,pr].find(x=>x?.error)?.error;
  if(firstErr){$('myTrainingList').innerHTML=`<div class="empty">${esc(firstErr.message)}</div>`;return}
  trainingCourses=c.data||[];trainingCourseRoles=cr.data||[];trainingAssignments=a.data||[];trainingSessions=s.data||[];trainingAttendance=att.data||[];trainingProfiles=pr.data||[];
  renderTrainingKpis();renderMyTraining();renderCourseCatalogue();renderTrainingSessions();renderTrainingAdmin();renderTrainingOversight();wireTrainingActions();
}

function renderTrainingKpis(){
  const mine=trainingAssignments.filter(x=>x.user_id===user.id&&x.status!=='Cancelled');
  const required=mine.filter(x=>x.is_required);
  const verified=required.filter(trainingVerified);
  const overdue=required.filter(trainingOverdue);
  const cm=trainingCourseMap();
  const verifiedHours=verified.reduce((sum,x)=>sum+Number(cm[x.course_id]?.duration_hours||0),0);
  $('trainingKpis').innerHTML=[
    ['My required',required.length],['Verified',verified.length],['Overdue',overdue.length],['Verified hours',hours(verifiedHours)]
  ].map(([k,v])=>`<div class="kpi"><span class="muted small">${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
}

function renderMyTraining(){
  const cm=trainingCourseMap();
  const mine=trainingAssignments.filter(x=>x.user_id===user.id&&x.status!=='Cancelled').sort((a,b)=>Number(trainingOverdue(b))-Number(trainingOverdue(a))||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
  $('myTrainingList').innerHTML=mine.length?mine.map(a=>{
    const c=cm[a.course_id]||{};const url=safeUrl(c.external_url);
    return `<article class="item" data-training-assignment="${a.id}"><div class="itemHead"><div class="grow"><b>${esc(c.title||'Training course')}</b><div class="meta">${esc(c.category||'Training')} • ${hours(c.duration_hours)} hours${a.due_date?' • Due '+fmtDate(a.due_date):''}${a.is_required?' • Required':' • Optional'}</div></div>${trainingBadge(a)}</div>${progressBar(a.progress_percent)}${a.score!=null?`<div class="meta">Assessment score: ${esc(a.score)}%${c.pass_mark!=null?' • Pass mark '+esc(c.pass_mark)+'%':''}</div>`:''}${a.verification_notes?`<div class="notice small" style="margin-top:8px"><b>Verification note:</b> ${esc(a.verification_notes)}</div>`:''}<div class="actions">${url?`<a class="btn alt sm" href="${esc(url)}" target="_blank" rel="noopener">Open course</a>`:''}${!['Exempt','Cancelled'].includes(a.status)?'<button class="btn sm" data-progress>Update progress</button>':''}${a.evidence_path?'<button class="btn alt sm" data-open="evidence">View evidence</button>':''}${a.certificate_path?'<button class="btn alt sm" data-open="certificate">View certificate</button>':''}</div></article>`
  }).join(''):'<div class="empty">No training has been assigned to you yet.</div>';
}

function renderCourseCatalogue(){
  const mineRoles=new Set(roles);const reqMap={};
  trainingCourseRoles.forEach(r=>(reqMap[r.course_id]??=[]).push(r));
  $('trainingCourseList').innerHTML=trainingCourses.filter(c=>c.is_active||canManageTraining()).map(c=>{
    const req=reqMap[c.id]||[];const myReq=req.filter(r=>mineRoles.has(r.role_name));const url=safeUrl(c.external_url);
    return `<div class="item" data-training-course="${c.id}"><div class="itemHead"><div class="grow"><b>${esc(c.title)}</b><div class="meta">${esc(c.provider)} • ${esc(c.delivery_mode)} • ${hours(c.duration_hours)} hours</div></div>${myReq.length?'<span class="badge warn">Required for your role</span>':c.is_active?'<span class="badge info">Available</span>':'<span class="badge bad">Archived</span>'}</div>${c.description?`<div class="bodyText">${esc(c.description)}</div>`:''}<div class="meta" style="margin-top:7px">Category: ${esc(c.category)}${c.pass_mark!=null?' • Pass mark '+esc(c.pass_mark)+'%':''}</div>${req.length?`<div class="meta">Role requirements: ${esc(req.map(r=>r.role_name+(r.is_mandatory?' (mandatory)':'')).join(', '))}</div>`:''}<div class="actions">${url?`<a class="btn alt sm" href="${esc(url)}" target="_blank" rel="noopener">Course link</a>`:''}${canManageTraining()?'<button class="btn alt sm" data-assign-course>Assign member</button>':''}</div></div>`
  }).join('')||'<div class="empty">No courses in the catalogue.</div>';
}

function renderTrainingSessions(){
  const cm=trainingCourseMap();
  $('trainingSessionsList').innerHTML=trainingSessions.length?trainingSessions.map(s=>{
    const attendance=trainingAttendance.filter(a=>a.session_id===s.id);const mine=attendance.find(a=>a.user_id===user.id);const course=cm[s.course_id];
    const stats={Present:0,Partial:0,Absent:0,Excused:0,Registered:0};attendance.forEach(a=>stats[a.status]=(stats[a.status]||0)+1);
    return `<div class="item" data-training-session="${s.id}"><div class="itemHead"><div class="grow"><b>${esc(s.title)}</b><div class="meta">${new Date(s.session_date).toLocaleString()} • ${esc(s.delivery_mode)}${course?' • '+esc(course.title):''}</div></div>${mine?badge(mine.status):''}</div><div class="meta">${s.facilitator?'Facilitator: '+esc(s.facilitator)+' • ':''}${s.location?'Location: '+esc(s.location):''}</div>${s.notes?`<div class="bodyText">${esc(s.notes)}</div>`:''}${hasAny([ROLE.ED,ROLE.BOARD,ROLE.TRAIN])?`<div class="meta">Attendance: ${stats.Present} present • ${stats.Partial} partial • ${stats.Absent} absent • ${stats.Excused} excused • ${stats.Registered} registered</div>`:''}<div class="actions">${safeUrl(s.meeting_url)?`<a class="btn alt sm" href="${esc(safeUrl(s.meeting_url))}" target="_blank" rel="noopener">Join/open link</a>`:''}${canManageTrainingSessions()?'<button class="btn sm" data-attendance>Attendance</button>':''}</div></div>`
  }).join(''):'<div class="empty">No training sessions scheduled yet.</div>';
}

function renderTrainingAdmin(){
  const admin=$('trainingAdmin');admin.classList.toggle('hidden',!canManageTraining());
  $('newTrainingSessionBtn').classList.toggle('hidden',!canManageTrainingSessions());
}

function renderTrainingOversight(){
  const box=$('trainingOversight');
  if(canManageTraining()){
    box.classList.remove('hidden');
    const cm=trainingCourseMap();
    $('trainingOversightTitle').textContent='Committee compliance register';
    $('trainingComplianceList').innerHTML=trainingProfiles.length?trainingProfiles.map(p=>{
      const rows=trainingAssignments.filter(a=>a.user_id===p.id&&a.is_required&&a.status!=='Cancelled');
      const verified=rows.filter(trainingVerified);const overdue=rows.filter(trainingOverdue);const h=verified.reduce((n,a)=>n+Number(cm[a.course_id]?.duration_hours||0),0);
      return `<div class="item"><div class="itemHead"><div class="grow"><b>${esc(p.full_name)}</b><div class="meta">${esc(p.role)} • ${verified.length}/${rows.length} verified • ${overdue.length} overdue • ${hours(h)} verified hours</div>${progressBar(pct(verified.length,rows.length))}</div><span class="badge ${overdue.length?'bad':''}">${pct(verified.length,rows.length)}%</span></div></div>`
    }).join(''):'<div class="empty">No active committee profiles.</div>';
  }else if(has(ROLE.BOARD)){
    box.classList.remove('hidden');$('trainingOversightTitle').textContent='Governance training compliance';
    const req=trainingAssignments.filter(a=>a.is_required&&a.status!=='Cancelled');const verified=req.filter(trainingVerified);const overdue=req.filter(trainingOverdue);const people=new Set(req.map(a=>a.user_id)).size;
    $('trainingComplianceList').innerHTML=`<div class="kpis"><div class="kpi"><span class="muted small">Members tracked</span><b>${people}</b></div><div class="kpi"><span class="muted small">Required assignments</span><b>${req.length}</b></div><div class="kpi"><span class="muted small">Verified completion</span><b>${pct(verified.length,req.length)}%</b></div><div class="kpi"><span class="muted small">Overdue</span><b>${overdue.length}</b></div></div><div class="notice small" style="margin-top:10px">Advisory Board oversight shows compliance totals. Personal certificate and evidence files remain restricted to the member and authorised training managers.</div>`;
  }else box.classList.add('hidden');
}

function wireTrainingActions(){
  $('myTrainingList').querySelectorAll('[data-training-assignment]').forEach(el=>{
    const id=el.dataset.trainingAssignment;const p=el.querySelector('[data-progress]');if(p)p.onclick=()=>trainingProgressModal(id);
    el.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openTrainingFile(id,b.dataset.open));
  });
  $('trainingCourseList').querySelectorAll('[data-training-course]').forEach(el=>{const b=el.querySelector('[data-assign-course]');if(b)b.onclick=()=>trainingAssignmentModal(el.dataset.trainingCourse)});
  $('trainingSessionsList').querySelectorAll('[data-training-session]').forEach(el=>{const b=el.querySelector('[data-attendance]');if(b)b.onclick=()=>trainingAttendanceModal(el.dataset.trainingSession)});
}

async function uploadTrainingFile(assignment,file,kind){
  if(!file)return null;
  const allowed=['application/pdf','image/jpeg','image/png','image/webp'];
  if(file.size>10*1024*1024)throw new Error('Training files must be 10 MB or smaller.');
  if(!allowed.includes(file.type))throw new Error('Use PDF, JPEG, PNG or WebP for training evidence.');
  const safe=file.name.replace(/[^A-Za-z0-9._-]+/g,'_').slice(-100)||'file';
  const path=`${assignment.user_id}/${assignment.id}/${kind}-${Date.now()}-${safe}`;
  const r=await db.storage.from('sami-training').upload(path,file,{upsert:false,contentType:file.type});
  if(r.error)throw r.error;return path;
}

function trainingProgressModal(id){
  const a=trainingAssignments.find(x=>x.id===id);if(!a)return;const c=trainingCourseMap()[a.course_id]||{};
  modal('Update training progress',`<form id="trainProgressForm" class="form"><div class="notice small"><b>${esc(c.title||'Training')}</b><br>Completion can be self-reported, but official compliance requires Executive Director or Trainer/Mentor verification.</div><div class="two"><label>Status<select id="tpStatus"><option>Not Started</option><option>In Progress</option><option>Completed</option></select></label><label>Progress %<input id="tpPct" type="number" min="0" max="100" value="${esc(a.progress_percent)}"></label></div><label>Assessment score % (optional)<input id="tpScore" type="number" min="0" max="100" step="0.01" value="${a.score??''}"></label><label>Learning notes<textarea id="tpNotes">${esc(a.notes||'')}</textarea></label><div class="two"><label>Evidence / assignment<input id="tpEvidence" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label><label>Certificate<input id="tpCertificate" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label></div><button class="btn">Save training progress</button></form><div id="tpMsg" class="status warn">Uploaded files are private SAMI training records.</div>`,()=>{
    $('tpStatus').value=['Not Started','In Progress','Completed'].includes(a.status)?a.status:'In Progress';
    $('trainProgressForm').onsubmit=async e=>{e.preventDefault();modalStatus('tpMsg','Saving progress…','warn');try{
      const patch={status:$('tpStatus').value,progress_percent:Number($('tpPct').value||0),score:$('tpScore').value===''?null:Number($('tpScore').value),notes:$('tpNotes').value.trim()||null};
      if(patch.status==='In Progress'&&!a.started_at)patch.started_at=new Date().toISOString();
      if(patch.status==='Completed'){patch.progress_percent=100;patch.completed_at=new Date().toISOString()}
      const ev=$('tpEvidence').files[0],cert=$('tpCertificate').files[0];
      if(ev)patch.evidence_path=await uploadTrainingFile(a,ev,'evidence');
      if(cert){patch.certificate_path=await uploadTrainingFile(a,cert,'certificate');patch.certificate_issued_at=todayISO()}
      const r=await db.from('training_assignments').update(patch).eq('id',id).select('id').single();if(r.error)throw r.error;
      closeModal();toast(patch.status==='Completed'?'Completion submitted for verification.':'Training progress updated.');await Promise.all([loadTraining(),loadDashboard()]);
    }catch(err){modalStatus('tpMsg',err?.message||'Could not save training progress.','err')}};
  });
}

async function openTrainingFile(id,kind){
  const a=trainingAssignments.find(x=>x.id===id);if(!a)return;const path=kind==='certificate'?a.certificate_path:a.evidence_path;if(!path)return;
  const r=await db.storage.from('sami-training').createSignedUrl(path,300);if(r.error)return toast(r.error.message,'err');window.open(r.data.signedUrl,'_blank','noopener');
}

function trainingCourseModal(){
  if(!canManageTraining())return;
  modal('Create training course',`<form id="trainingCourseForm" class="form"><label>Course title<input id="tcTitle" required></label><label>Description<textarea id="tcDesc"></textarea></label><div class="two"><label>Provider<input id="tcProvider" value="SAMI Foundation" required></label><label>Category<input id="tcCategory" value="Leadership" required></label></div><div class="three"><label>Delivery<select id="tcMode"><option>Self-paced</option><option>Online</option><option>Live Online</option><option>In Person</option><option>External</option><option>Blended</option></select></label><label>Hours<input id="tcHours" type="number" min="0" step="0.25" value="1"></label><label>Pass mark %<input id="tcPass" type="number" min="0" max="100" step="0.01"></label></div><label>Course/resource URL (optional)<input id="tcUrl" type="url"></label><label>Required roles</label><div id="tcRoles" class="checks">${roleCatalog.map(r=>`<label><input type="checkbox" value="${esc(r.name)}"><span>${esc(r.name)}</span></label>`).join('')}</div><label>Target completion days<input id="tcDays" type="number" min="1" max="3650" value="30"></label><button class="btn">Create course</button></form><div id="tcMsg" class="status warn">Selected role requirements will automatically assign the course to active members in those roles.</div>`,()=>{
    $('trainingCourseForm').onsubmit=async e=>{e.preventDefault();modalStatus('tcMsg','Creating course…','warn');const rolesPicked=[...$('tcRoles').querySelectorAll('input:checked')].map(x=>x.value);try{
      const r=await db.from('training_courses').insert({title:$('tcTitle').value.trim(),description:$('tcDesc').value.trim()||null,provider:$('tcProvider').value.trim(),category:$('tcCategory').value.trim(),delivery_mode:$('tcMode').value,external_url:$('tcUrl').value.trim()||null,duration_hours:Number($('tcHours').value||0),pass_mark:$('tcPass').value===''?null:Number($('tcPass').value),created_by:user.id}).select('id').single();if(r.error)throw r.error;
      if(rolesPicked.length){const rows=rolesPicked.map(role_name=>({course_id:r.data.id,role_name,is_mandatory:true,target_days:Number($('tcDays').value||30)}));const rr=await db.from('training_course_roles').insert(rows);if(rr.error)throw rr.error}
      closeModal();toast('Training course created and role requirements applied.');await loadTraining();
    }catch(err){modalStatus('tcMsg',err?.message||'Could not create course.','err')}};
  });
}

async function trainingAssignmentModal(courseId=''){
  if(!canManageTraining())return;
  if(!trainingProfiles.length){const p=await db.from('profiles').select('id,full_name,role,is_active').eq('is_active',true).order('full_name');if(p.error)return toast(p.error.message,'err');trainingProfiles=p.data||[]}
  modal('Assign training to member',`<form id="trainingAssignForm" class="form"><label>Course<select id="taCourse">${trainingCourses.filter(c=>c.is_active).map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></label><label>Committee member<select id="taMember">${trainingProfiles.map(p=>`<option value="${p.id}">${esc(p.full_name)} — ${esc(p.role)}</option>`).join('')}</select></label><div class="two"><label>Due date<input id="taDue" type="date"></label><label>Requirement<select id="taRequired"><option value="true">Required</option><option value="false">Optional</option></select></label></div><button class="btn">Assign course</button></form><div id="taMsg" class="status warn">One active assignment is kept per member and course.</div>`,()=>{
    if(courseId)$('taCourse').value=courseId;
    const d=new Date();d.setDate(d.getDate()+30);$('taDue').value=d.toISOString().slice(0,10);
    $('trainingAssignForm').onsubmit=async e=>{e.preventDefault();const r=await db.from('training_assignments').insert({course_id:$('taCourse').value,user_id:$('taMember').value,assigned_by:user.id,due_date:$('taDue').value||null,is_required:$('taRequired').value==='true'}).select('id').single();if(r.error)return modalStatus('taMsg',r.error.code==='23505'?'That member already has this course assigned.':r.error.message,'err');closeModal();toast('Training assigned.');await loadTraining()};
  });
}

function trainingSessionModal(){
  if(!canManageTrainingSessions())return;
  modal('Schedule training session',`<form id="trainingSessionForm" class="form"><label>Session title<input id="tsTitle" required></label><label>Linked course (optional)<select id="tsCourse"><option value="">No linked course</option>${trainingCourses.filter(c=>c.is_active).map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></label><div class="two"><label>Starts<input id="tsStart" type="datetime-local" required></label><label>Ends<input id="tsEnd" type="datetime-local"></label></div><div class="two"><label>Delivery<select id="tsMode"><option>Live Online</option><option>In Person</option><option>Online</option><option>Blended</option></select></label><label>Facilitator<input id="tsFacilitator"></label></div><label>Meeting/resource URL<input id="tsUrl" type="url"></label><label>Location<input id="tsLocation"></label><label>Notes<textarea id="tsNotes"></textarea></label><button class="btn">Schedule session</button></form><div id="tsMsg" class="status warn">Attendance can be marked after the session is created.</div>`,()=>{
    const d=new Date(Date.now()+86400000);d.setMinutes(0,0,0);$('tsStart').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    $('trainingSessionForm').onsubmit=async e=>{e.preventDefault();const r=await db.from('training_sessions').insert({course_id:$('tsCourse').value||null,title:$('tsTitle').value.trim(),session_date:new Date($('tsStart').value).toISOString(),end_at:$('tsEnd').value?new Date($('tsEnd').value).toISOString():null,delivery_mode:$('tsMode').value,facilitator:$('tsFacilitator').value.trim()||null,meeting_url:$('tsUrl').value.trim()||null,location:$('tsLocation').value.trim()||null,notes:$('tsNotes').value.trim()||null,created_by:user.id}).select('id').single();if(r.error)return modalStatus('tsMsg',r.error.message,'err');closeModal();toast('Training session scheduled.');await loadTraining()};
  });
}

async function trainingAttendanceModal(sessionId){
  if(!canManageTrainingSessions())return;
  if(!trainingProfiles.length){const p=await db.from('profiles').select('id,full_name,role,is_active').eq('is_active',true).order('full_name');if(p.error)return toast(p.error.message,'err');trainingProfiles=p.data||[]}
  const existing=Object.fromEntries(trainingAttendance.filter(a=>a.session_id===sessionId).map(a=>[a.user_id,a]));
  modal('Training attendance',`<form id="trainingAttendanceForm" class="form"><div class="tableWrap"><table class="table"><thead><tr><th>Member</th><th>Status</th><th>Minutes</th></tr></thead><tbody>${trainingProfiles.map(p=>{const a=existing[p.id]||{};return`<tr data-att-member="${p.id}"><td><b>${esc(p.full_name)}</b><div class="meta">${esc(p.role)}</div></td><td><select data-att-status><option>Registered</option><option>Present</option><option>Partial</option><option>Absent</option><option>Excused</option></select></td><td><input data-att-min type="number" min="0" value="${esc(a.attended_minutes||0)}" style="min-width:90px"></td></tr>`}).join('')}</tbody></table></div><button class="btn">Save attendance</button></form><div id="atMsg" class="status warn">Attendance is an official SAMI training record.</div>`,()=>{
    $('trainingAttendanceForm').querySelectorAll('[data-att-member]').forEach(row=>{const a=existing[row.dataset.attMember];if(a)row.querySelector('[data-att-status]').value=a.status});
    $('trainingAttendanceForm').onsubmit=async e=>{e.preventDefault();modalStatus('atMsg','Saving attendance…','warn');const rows=[...$('trainingAttendanceForm').querySelectorAll('[data-att-member]')].map(row=>({session_id:sessionId,user_id:row.dataset.attMember,status:row.querySelector('[data-att-status]').value,attended_minutes:Number(row.querySelector('[data-att-min]').value||0),marked_by:user.id,marked_at:new Date().toISOString()}));const r=await db.from('training_attendance').upsert(rows,{onConflict:'session_id,user_id'});if(r.error)return modalStatus('atMsg',r.error.message,'err');closeModal();toast('Training attendance saved.');await loadTraining()};
  });
}

async function verifyTrainingModal(id){
  if(!canManageTraining())return;const a=trainingAssignments.find(x=>x.id===id);if(!a)return;const c=trainingCourseMap()[a.course_id]||{};
  modal('Verify training completion',`<form id="trainingVerifyForm" class="form"><div class="notice small"><b>${esc(c.title||'Training')}</b><br>Verify only after reviewing the member’s completion and any required evidence.</div><label>Verification note<textarea id="tvNote">${esc(a.verification_notes||'')}</textarea></label><button class="btn">Verify completion</button></form><div id="tvMsg" class="status warn">Verification becomes part of the official compliance record.</div>`,()=>{$('trainingVerifyForm').onsubmit=async e=>{e.preventDefault();const r=await db.from('training_assignments').update({verified_at:new Date().toISOString(),verification_notes:$('tvNote').value.trim()||null}).eq('id',id).eq('status','Completed').select('id').single();if(r.error)return modalStatus('tvMsg',r.error.message,'err');closeModal();toast('Training completion verified.');await loadTraining()}});
}

function renderManagerAssignmentQueue(){
  if(!canManageTraining())return;
  const cm=trainingCourseMap();const pm=Object.fromEntries(trainingProfiles.map(p=>[p.id,p]));
  const q=trainingAssignments.filter(a=>a.status==='Completed'&&!a.verified_at);
  $('trainingVerificationQueue').innerHTML=q.length?q.map(a=>`<div class="item" data-verify-training="${a.id}"><div class="itemHead"><div class="grow"><b>${esc(cm[a.course_id]?.title||'Training')}</b><div class="meta">${esc(pm[a.user_id]?.full_name||'Committee member')}${a.score!=null?' • Score '+esc(a.score)+'%':''}</div></div><span class="badge warn">Awaiting verification</span></div><div class="actions">${a.evidence_path?'<button class="btn alt sm" data-manager-file="evidence">Evidence</button>':''}${a.certificate_path?'<button class="btn alt sm" data-manager-file="certificate">Certificate</button>':''}<button class="btn sm" data-verify>Verify</button></div></div>`).join(''):'<div class="empty">No completions are waiting for verification.</div>';
  $('trainingVerificationQueue').querySelectorAll('[data-verify-training]').forEach(el=>{el.querySelector('[data-verify]').onclick=()=>verifyTrainingModal(el.dataset.verifyTraining);el.querySelectorAll('[data-manager-file]').forEach(b=>b.onclick=()=>openTrainingFile(el.dataset.verifyTraining,b.dataset.managerFile))});
}

const v13OldRenderAdmin=renderTrainingAdmin;
renderTrainingAdmin=function(){v13OldRenderAdmin();if(canManageTraining())renderManagerAssignmentQueue()};

$('newTrainingCourseBtn').onclick=trainingCourseModal;
$('assignTrainingBtn').onclick=()=>trainingAssignmentModal('');
$('newTrainingSessionBtn').onclick=trainingSessionModal;
