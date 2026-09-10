const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('meetPermission',{details:()=>ipcRenderer.invoke('permission:details'),answer:allow=>ipcRenderer.send('permission:answer',allow===true)});
