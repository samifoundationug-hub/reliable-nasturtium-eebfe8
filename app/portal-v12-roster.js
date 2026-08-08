'use strict';
const V12_PLANNED_COMMITTEE=[
 {name:'Sarah Mirembe Namusisi',primary:ROLE.ED,extras:[]},
 {name:'Elijah Mukisa',primary:ROLE.BOARD,extras:[]},
 {name:'David Musasizi',primary:ROLE.OVER,extras:[]},
 {name:'Tumuhereze Milly',primary:ROLE.COORD,extras:[ROLE.BOARD]},
 {name:'Nakyambadde Joanitah',primary:ROLE.COORD,extras:[ROLE.FIN,ROLE.BOARD]},
 {name:'Namusoke Martha',primary:ROLE.FIN,extras:[ROLE.BOARD]},
 {name:'Rose Nakitanda',primary:ROLE.SEC,extras:[ROLE.BOARD]},
 {name:'Waligo Ivan',primary:ROLE.BOARD,extras:[]},
 {name:'Volunteer Trainers & Mentors',primary:ROLE.TRAIN,extras:[],vacancy:true},
 {name:'Beneficiary Leadership Committee',primary:ROLE.BEN,extras:[],vacancy:true}
];
function v12NameKey(v){return String(v||'').trim().toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ')}
function v12RenderPlannedRoster(invites){
 const activeByName=new Map((profilesCache||[]).map(x=>[v12NameKey(x.full_name),x]));
 const inviteByName=new Map((invites||[]).map(x=>[v12NameKey(x.full_name),x]));
 let active=0,invited=0,needsEmail=0,vacancies=0;
 $('plannedRosterList').innerHTML=V12_PLANNED_COMMITTEE.map((m,i)=>{
  if(m.vacancy){vacancies++;return `<div class="item"><div class="itemHead"><div class="grow"><b>${esc(m.name)}</b><div class="meta">Role: ${esc(m.primary)} • Position currently vacant</div></div><span class="badge info">Vacant</span></div></div>`}
  const p=activeByName.get(v12NameKey(m.name));
  const iv=inviteByName.get(v12NameKey(m.name));
  let state='Email needed',cls='warn';
  if(p?.is_active){state='Active';cls='';active++}
  else if(iv){state=iv.claimed_at?'Activated':iv.is_active?'Invited':'Revoked';cls=iv.is_active||iv.claimed_at?'':'bad';invited++}
  else needsEmail++;
  const extras=m.extras.length?' • Additional: '+esc(m.extras.join(', ')):'';
  const canPrefill=!p&&!iv&&m.primary!==ROLE.ED;
  return `<div class="item" data-v12-roster="${i}"><div class="itemHead"><div class="grow"><b>${esc(m.name)}</b><div class="meta">Primary: ${esc(m.primary)}${extras}</div></div><span class="badge ${cls}">${esc(state)}</span></div>${canPrefill?`<div class="actions"><button class="btn alt sm" data-v12-prefill>Prepare invitation</button></div>`:''}</div>`;
 }).join('');
 $('rosterSummary').innerHTML=[['Active accounts',active],['Invited / recorded',invited],['Email needed',needsEmail],['Vacancies',vacancies]].map(([k,v])=>`<div class="kpi"><span class="muted small">${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
}
function v12WireRoster(){
 $('plannedRosterList').querySelectorAll('[data-v12-roster]').forEach(el=>{
  const b=el.querySelector('[data-v12-prefill]');if(!b)return;
  b.onclick=()=>{
   const m=V12_PLANNED_COMMITTEE[Number(el.dataset.v12Roster)];
   renderInviteRoleInputs();
   $('inviteName').value=m.name;$('inviteEmail').value='';$('invitePhone').value='';$('invitePrimary').value=m.primary;
   document.querySelectorAll('input[name=extraRole]').forEach(x=>x.checked=m.extras.includes(x.value));
   $('inviteEmail').focus();$('inviteForm').scrollIntoView({behavior:'smooth',block:'center'});
   toast('Roster details loaded. Enter the member’s exact email before creating the invitation.','warn');
  };
 });
}
const v11LoadCommittee=loadCommittee;
loadCommittee=async function(){
 await v11LoadCommittee();
 if(!has(ROLE.ED))return;
 const inv=await db.from('committee_invites').select('id,email,full_name,role,is_active,claimed_at').order('created_at',{ascending:false});
 if(inv.error){$('plannedRosterList').innerHTML=`<div class="empty">${esc(inv.error.message)}</div>`;return}
 v12RenderPlannedRoster(inv.data||[]);v12WireRoster();
};