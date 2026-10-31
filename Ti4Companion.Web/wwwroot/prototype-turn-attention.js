let sentinel=null,callback=null,enabled=false,pending=false;
function report(value){callback?.invokeMethodAsync('WakeChanged',value).catch(()=>{});}
export async function request(){
    enabled=true;
    if(pending||sentinel||document.visibilityState!=='visible'||!navigator.wakeLock||!isSecureContext)return;
    pending=true;
    try{const lock=await navigator.wakeLock.request('screen');if(!enabled){await lock.release();return;}sentinel=lock;report(true);lock.addEventListener('release',()=>{if(sentinel===lock)sentinel=null;report(false);});}
    catch{report(false);}finally{pending=false;}
}
function visible(){if(enabled&&document.visibilityState==='visible')request();}
export async function connect(dotnet){callback=dotnet;enabled=true;document.addEventListener('visibilitychange',visible);await request();}
export function update(active){document.title=active?'Your turn · TI4 Table Companion':'TI4 · Table Companion';}
export async function disconnect(){enabled=false;document.removeEventListener('visibilitychange',visible);callback=null;const lock=sentinel;sentinel=null;if(lock&&!lock.released)await lock.release();document.title='TI4 · Table Companion';}
