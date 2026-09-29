(function () {
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var files = Folder("/Users/sibhi-zstch1643/conductor/workspaces/agentic-feedback-sdk/ndjamena/brand/svg").getFiles("*.svg"), n = 0;
  for (var i = 0; i < files.length; i++) {
    var d = app.open(files[i]);
    var o = new IllustratorSaveOptions(); o.pdfCompatible = true;
    d.saveAs(new File("/Users/sibhi-zstch1643/conductor/workspaces/agentic-feedback-sdk/ndjamena/brand/ai/" + files[i].name.replace(/\.svg$/, ".ai")), o);
    d.close(SaveOptions.DONOTSAVECHANGES); n++;
  }
  return "saved " + n;
})();
