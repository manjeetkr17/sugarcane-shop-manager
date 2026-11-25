const request = async (path, options={}) => {
  const response = await fetch(`/api${path}`, { headers:{'Content-Type':'application/json'}, ...options });
  const data = await response.json().catch(()=>({message:'Unexpected server response'}));
  if(!response.ok) throw new Error(data.message || 'Request failed');
  return data;
};
export const api = {
  get:(p)=>request(p),
  post:(p,body)=>request(p,{method:'POST',body:JSON.stringify(body)}),
  put:(p,body)=>request(p,{method:'PUT',body:JSON.stringify(body)}),
  del:(p)=>request(p,{method:'DELETE'})
};
