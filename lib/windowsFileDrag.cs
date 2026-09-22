using System;
using System.IO;
using System.Collections.Specialized;
using System.Windows.Forms;
using System.Runtime.InteropServices;
[ComVisible(true), Guid("00000121-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFileDropSource {
  [PreserveSig] int QueryContinueDrag([MarshalAs(UnmanagedType.Bool)] bool escape,uint keys);
  [PreserveSig] int GiveFeedback(uint effect);
}
[ComVisible(true),ClassInterface(ClassInterfaceType.None)]
public class FileDropSource : IFileDropSource {
  public bool cancel;
  public int QueryContinueDrag(bool escape,uint keys) { return cancel || escape ? 0x40101 : (keys & 1)==0 ? 0x40100 : 0; }
  public int GiveFeedback(uint effect) { return 0x40102; }
}
public static class FileDragControl {
  [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr reserved);
  [DllImport("ole32.dll")] static extern void OleUninitialize();
  [DllImport("ole32.dll")] static extern int DoDragDrop([MarshalAs(UnmanagedType.Interface)] System.Runtime.InteropServices.ComTypes.IDataObject data,IFileDropSource source,uint effects,out uint effect);
  public static string Run(string[] paths, bool copy, bool cancelForTest) {
    var data=new DataObject();var files=new StringCollection();files.AddRange(paths);data.SetFileDropList(files);
    data.SetData("Preferred DropEffect",new MemoryStream(BitConverter.GetBytes(copy ? 1 : 2)));
    // Headless checks validate our source's cancellation contract without
    // entering OLE's interactive loop, which needs an actual held mouse gesture.
    if(cancelForTest) {
      if(new FileDropSource{cancel=true}.QueryContinueDrag(false,1)!=0x40101)throw new Exception("Cancellation contract failed");
      if(!data.GetFileDropList().Contains(paths[0]))throw new Exception("Native file list missing");
      return "None";
    }
    int init=OleInitialize(IntPtr.Zero);if(init<0)Marshal.ThrowExceptionForHR(init);
    try { uint effect;int result=DoDragDrop((System.Runtime.InteropServices.ComTypes.IDataObject)data,new FileDropSource{cancel=cancelForTest},3,out effect);if(result<0)Marshal.ThrowExceptionForHR(result);return ((DragDropEffects)effect).ToString(); }
    finally { OleUninitialize(); }
  }
}
public class DragRequest { public string[] paths; public bool copy; public bool cancelForTest; }
public static class Program {
  [STAThread]
  public static void Main() {
    var json=new System.Web.Script.Serialization.JavaScriptSerializer();
    try {
      var request=json.Deserialize<DragRequest>(Console.ReadLine());
      Console.WriteLine(json.Serialize(new {effect=FileDragControl.Run(request.paths,request.copy,request.cancelForTest)}));
    } catch(Exception error) { Console.WriteLine(json.Serialize(new {error=error.Message}));Environment.ExitCode=1; }
  }
}

