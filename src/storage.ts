const databaseName='audiopure-studio';
function database(){
 return new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open(databaseName,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('projects');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
 });
}
export async function project<T>(value?:T):Promise<T|undefined>{
 const db=await database();
 try{
   return await new Promise((resolve,reject)=>{
     const transaction=db.transaction('projects',value===undefined?'readonly':'readwrite');
     const store=transaction.objectStore('projects');
     const request=value===undefined?store.get('current'):store.put(value,'current');
     transaction.oncomplete=()=>resolve(value===undefined?request.result:undefined);
     transaction.onabort=()=>reject(transaction.error||new Error('Local project storage was interrupted.'));
   });
 }finally{db.close();}
}
