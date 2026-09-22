const ImageViewer={
  async open(owner,entry){
    const win=new UtilityWindow(owner.manager,`Image — ${entry.name}`,760,580);
    win.type='image-viewer';win.path=owner.path;win.entries=[...owner.entries];win.preview=entry;win.previewZoom=1;
    win.el.querySelector('.fm-locationbar').style.display='none';
    const keys=e=>{if(owner.manager.getActive()!==win||e.target.closest?.('input,textarea,select'))return;
      if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();FileView.stepPreview(win,e.key==='ArrowLeft'?-1:1);}
      if(e.key==='Escape'){e.preventDefault();owner.manager.close(win.id);}
    };
    document.addEventListener('keydown',keys);win.destroy=()=>document.removeEventListener('keydown',keys);
    await FileView.render(win);return win;
  }
};
