export function validateRegistration(body, posts) {
 const event=posts.find(p=>p.id===body.eventId&&p.type==='activity'&&p.status==='published'&&!p.deleted&&p.isDemo);
 const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
 if(!event)throw new Error('這個活動目前不開放本站報名');
 if(!name||name.length>80||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isInteger(body.count)||body.count<1||body.count>5||body.consent!==true)throw new Error('請填妥姓名、Email、人數並同意測試說明');
 return {eventId:event.id,eventTitle:event.title,name,email,count:body.count,isDemo:true,createdAt:new Date().toISOString()};
}
