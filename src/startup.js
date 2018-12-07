require("/lib/REST.js");

Log.write("Started");

var irisREST = new REST("/rest/design.yaml", "olap");

HTTPServer.on("connection", function(){
	let url = Request.getUrl().toLowerCase().split("?")[0].replace("http://localhost/irisana", "");
	let urlPath = Request.getPath();

	if(url.endsWith("load")) {
		irisREST.reload().then(() => {
			end("Loaded OpenAPI definition");
		});
	} else {
		irisREST.process(url, urlPath);
	}
});

