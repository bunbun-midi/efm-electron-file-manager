// Suggestions retain their typed prefix while the user cycles through the list.
const LocationBar = {
  attach(win) {
    const input=win.el.querySelector('.fm-location-input'),bar=input.parentElement;
    const popup=document.createElement('div');popup.className='location-suggestions';popup.hidden=true;popup.id=`${win.id}-suggestions`;popup.setAttribute('role','listbox');bar.appendChild(popup);
    input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-expanded','false');
    let generation=0,pending=null,items=[],index=-1,typed='',timer;
    const hide=()=>{popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
    const focusView=()=>{hide();const content=win.el.querySelector('.fm-content');content.tabIndex=0;content.focus();};
    const render=()=>{
      popup.replaceChildren();
      items.forEach((item,i)=>{const row=document.createElement('div');row.className='location-suggestion';row.id=`${popup.id}-${i}`;row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===index));row.textContent=item.name;row.title=item.path;
        row.onmousedown=e=>e.preventDefault();row.onclick=()=>{input.value=win.displayPath(item.path);hide();go();};popup.appendChild(row);});
      popup.hidden=!items.length||document.activeElement!==input;input.setAttribute('aria-expanded',String(!popup.hidden));
      if(index>=0){input.setAttribute('aria-activedescendant',`${popup.id}-${index}`);popup.children[index]?.scrollIntoView({block:'nearest'});}
    };
    const suggest=async()=>{
      const version=++generation,raw=input.value;typed=raw;index=-1;
      const slash=Math.max(raw.lastIndexOf('/'),window.fm.pathSep==='/'?-1:raw.lastIndexOf('\\'));
      const prefix=raw.slice(slash+1),part=raw.slice(0,slash+1);
      const directory=part?window.fm.resolveInput(win.path,part):win.path;
      try{const result=await window.fm.listDir(directory);if(version!==generation)return;
        items=(result.entries||[]).filter(entry=>entry.kind==='directory'&&entry.name.toLowerCase().startsWith(prefix.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));render();
      }catch{if(version===generation){items=[];hide();}}
    };
    const refresh=()=>pending=suggest().finally(()=>{pending=null;});
    const go=async()=>{
      clearTimeout(timer);const raw=input.value.trim();if(!raw)return;
      try{
        let target=window.fm.resolveInput(win.path,raw);
        if(target.startsWith('vdir://')){hide();await win.navigate(target,{preserveOnError:true});focusView();return;}
        const stat=await window.fm.locationStat(target);
        if(stat?.file){hide();const association=await window.fm.getAssociation(window.fm.extname(target));
          const error=association?await window.fm.openFileWith(target,association.appPath):await window.fm.openFile(target);
          if(typeof error==='string'&&error)throw Error(error);focusView();return;
        }
        if(!stat){if(typed!==raw||(!items.length&&!pending))await refresh();else if(pending)await pending;if(!items.length)throw Error('No matching file or folder.');target=items[0].path;}
        hide();await win.navigate(target,{preserveOnError:true});focusView();
      }catch(error){win.setStatus(`Could not open location: ${error.message}`);}
    };
    win.el.querySelector('.fm-go-btn').onclick=go;
    input.addEventListener('input',()=>{generation++;items=[];index=-1;hide();clearTimeout(timer);timer=setTimeout(refresh,120);});
    input.addEventListener('blur',hide);
    input.addEventListener('keydown',async e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();generation++;clearTimeout(timer);focusView();return;}
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();await go();return;}
      if(!['Tab','ArrowDown','ArrowUp'].includes(e.key)||input.readOnly)return;
      e.preventDefault();e.stopPropagation();clearTimeout(timer);
      if(!items.length){if(pending)await pending;else await refresh();}if(!items.length)return;
      const step=e.key==='ArrowUp'||(e.key==='Tab'&&e.shiftKey)?-1:1;
      index=index<0?(step>0?0:items.length-1):(index+step+items.length)%items.length;
      input.value=win.displayPath(items[index].path);input.setSelectionRange(input.value.length,input.value.length);render();
    });
  },
};
