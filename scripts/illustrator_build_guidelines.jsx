// Build brand/heresay-brand-guidelines.ai: every page of the guidelines PDF on its own artboard and layer.
(function () {
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var pdf = new File("/Users/sibhi-zstch1643/conductor/workspaces/agentic-feedback-sdk/ndjamena/brand/heresay-brand-guidelines.pdf");
  var out = new File("/Users/sibhi-zstch1643/conductor/workspaces/agentic-feedback-sdk/ndjamena/brand/heresay-brand-guidelines.ai");
  var N = 14, COLS = 4, GAP = 120;
  var names = ["Cover","The idea","Construction","Versions","Clear space and size","Colour","Typography","Wordmark and lockups","App icon and favicon","In other people's apps","Interface","Voice","Misuse","Files"];
  function pad(i) { return (i < 10 ? "0" : "") + i; }
  app.preferences.PDFFileOptions.pageToOpen = 1;
  var master = app.open(new File("/tmp/hs_pages/p1.pdf"));
  var r0 = master.artboards[0].artboardRect, W = r0[2] - r0[0], H = r0[1] - r0[3];
  master.artboards[0].name = "01 " + names[0];
  master.layers[0].name = "01 " + names[0];
  for (var i = 2; i <= N; i++) {
    app.preferences.PDFFileOptions.pageToOpen = i;
    var d = app.open(new File("/tmp/hs_pages/p" + i + ".pdf"));
    var col = (i - 1) % COLS, row = Math.floor((i - 1) / COLS);
    var L = r0[0] + col * (W + GAP), T = r0[1] - row * (H + GAP);
    var ab = master.artboards.add([L, T, L + W, T - H]);
    ab.name = pad(i) + " " + names[i - 1];
    var src = d.artboards[0].artboardRect, dx = L - src[0], dy = T - src[1];
    app.activeDocument = master;
    var lay = master.layers.add(); lay.name = pad(i) + " " + names[i - 1]; lay.zOrder(ZOrderMethod.SENDTOBACK);
    app.activeDocument = d;
    for (var l = d.layers.length - 1; l >= 0; l--) {
      var items = d.layers[l].pageItems;
      for (var k = items.length - 1; k >= 0; k--) {
        var dup = items[k].duplicate(lay, ElementPlacement.PLACEATBEGINNING);
        dup.translate(dx, dy);
      }
    }
    d.close(SaveOptions.DONOTSAVECHANGES);
  }
  app.activeDocument = master;
  var o = new IllustratorSaveOptions(); o.pdfCompatible = true; o.embedICCProfile = true;
  master.saveAs(out, o);
  var n = master.artboards.length;
  master.close(SaveOptions.DONOTSAVECHANGES);
  return "saved " + n + " artboards";
})();
