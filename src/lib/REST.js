require("/lib/yaml.js");
require("/lib/facts/View.js");
class REST {

    constructor(file, connection) {
        this.file = file;
        this.connection = connection;
        this.triggers = [];
        this.reload();
    }

    reload(){
        return IO.readText(this.file).then(text => {
            this.api = jsyaml.load(text);
            this.routes = {};
            this.links = {};

            for (const key in this.api.paths) {
                this.routes[key.toLowerCase()] = this.api.paths[key];
            }

            for (const key in this.api.links) {
                this.links[key.toLowerCase()] = this.api.links[key];
            }
        });
    }

    error(message, query) {
        const response = {
            method: Request.getMethod().toUpperCase(),
            url: Request.getUrl(),
            code: "500",
            message: message
        };

        if (query) response.query = query;

        end(JSON.stringify({
            result: {},
            response: response
        }));
    }

    success(result) {
        const response = {
            method: Request.getMethod().toUpperCase(),
            url: Request.getUrl(),
            code: "200"
        };

        end(JSON.stringify({
            result: JSON.parse(result),
            response: response
        }));
    }

    process(url, urlPath) {
        // Set the output type to JSON
        Response.setHeader("Content-Type", "application/json");

        // Check if the API is loaded
        if(!("api" in this && "routes" in this && "links" in this)) {
            return this.error("The API has not loaded yet");
        }

        // Routing parameters
        let fact = null;
        let dimension = null;
        let hierarchy = null;
        if(urlPath[1] == "facts" && urlPath.length > 2) {
            fact = urlPath[2].replace(/-/g, " ");
            url = url.replace(urlPath[2].toString().toLowerCase(), "{fact}");
            if(urlPath[3] == "dimensions" && urlPath.length > 4) {
                dimension = urlPath[4].replace(/-/g, " ");
                url = url.replace(urlPath[4].toString().toLowerCase(), "{dimension}");
                if(urlPath[5] == "hierarchies" && urlPath.length > 6) {
                    hierarchy = urlPath[6].replace(/-/g, " ");
                    url = url.replace(urlPath[6].toString().toLowerCase(), "{hierarchy}");
                }
            }
        }

        // Check if the route exists in the API
        if (url in this.routes) {

            // Method to lower case because all methods in yaml are also lower case
            const method = Request.getMethod().toLowerCase();
            const path = this.routes[url];

            // Check if the HTTP method is defined in the API
            if (!(method in path)) {
                return this.error("Method " + method + " is not supported");
            }

            // Url query parameters
            const params = Request.getParameters();

            if(url.includes("facts")) {
                let query;

                if(url == "/facts") {
                    OLAP.getFacts(this.connection).then(result => {
                        this.success(result);
                    }).catch(e => {
                        const message = e.toString();
        
                        // Try and extract the error message
                        const match = message.match(/ERROR: (.*?)$/);
                        if (match && typeof match[1] == "string") {
                            this.error(match[1]);
                        } else {
                            this.error((e.stack || e).toString(), query);
                        }
                    });
                    
                } else if(url == "/facts/{fact}/measures") {                    
                    OLAP.getMeasuresByFact(this.connection, fact).then(result => {
                        this.success(result);
                    }).catch(e => {
                        const message = e.toString();

                        // Try and extract the error message
                        const match = message.match(/ERROR: (.*?)$/);
                        if (match && typeof match[1] == "string") {
                            this.error(match[1]);
                        } else {
                            this.error((e.stack || e).toString(), query);
                        }
                    });
                } else if(url == "/facts/{fact}/dimensions") {
                    OLAP.getDimensionsByFact(this.connection, fact).then(result => {
                        this.success(result);
                    }).catch(e => {
                        const message = e.toString();
        
                        // Try and extract the error message
                        const match = message.match(/ERROR: (.*?)$/);
                        if (match && typeof match[1] == "string") {
                            this.error(match[1]);
                        } else {
                            this.error((e.stack || e).toString(), query);
                        }
                    });
                } else if(url == "/facts/{fact}/dimensions/{dimension}/hierarchies") {
                    OLAP.getHierarchiesByDimension(this.connection, dimension).then(result => {
                        this.success(result);
                    }).catch(e => {
                        const message = e.toString();
        
                        // Try and extract the error message
                        const match = message.match(/ERROR: (.*?)$/);
                        if (match && typeof match[1] == "string") {
                            this.error(match[1]);
                        } else {
                            this.error((e.stack || e).toString(), query);
                        }
                    });
                } else if(url == "/facts/{fact}/dimensions/{dimension}/hierarchies/{hierarchy}/members") {
                    OLAP.getMembers(this.connection, dimension, hierarchy).then(result => {
                        this.success(result);
                    }).catch(e => {
                        const message = e.toString();
        
                        // Try and extract the error message
                        const match = message.match(/ERROR: (.*?)$/);
                        if (match && typeof match[1] == "string") {
                            this.error(match[1]);
                        } else {
                            this.error((e.stack || e).toString(), query);
                        }
                    });
                }

            } else if (url.includes("graph")) {

                const fact = params["fact"].replace(/-/g, " ");
                const columns = params["columns"].replace(/-/g, " ").split(",");
                const rows = params["rows"].replace(/-/g, " ").split(",");
                let filter = [];
                let query = "";
                let columnQuery = "";
                let rowQuery = "";
                let filterQuery = "";
                if(params["filter"] != null) {
                   filter = params["filter"].replace(/-/g, " ").split(",");
                }

                // fill columnQuery string
                if(columns.length == 1) {
                    columnQuery = "select {[Measures].[" + columns[0] + "]} on columns, ";

                } else if (columns.length == 2) {
                    columnQuery = "select {[Measures].[" + columns[0] + "], [Measures].[" + columns[1] + "]} on columns, ";
                } else {
                    this.error("Either 1 or 2 columns must be given");
                }

                // fill rowQuery string
                let filtSplit = {};
                let filtHierarchy = [];
                let leng = filter.length;
                for(let n = 0; n < leng; n++) {
                    filtSplit[n] = filter[n].split(".");
                    filtHierarchy[n] = filtSplit[n][0] + "." + filtSplit[n][1];
                }

                if(rows.length == 1) {
                    const row = rows[0].split(".");
                    if(filtHierarchy.includes(rows[0])) {
                        rowQuery = "{";
                        let a = 0;
                        let toSplice = [];
                        for(let p = 0; p < leng; p++) {
                            if(filtSplit[p][0] == row[0] && filtSplit[p][1] == row[1]) {
                                if(a > 0) {
                                    rowQuery += ",";
                                }
                                rowQuery += "[" + row[0] + "].[" + row[1] + "].[" + filtSplit[p][2] + "]";
                                toSplice.push(p);
                                a++;
                            }
                        }
                        for(let q = toSplice.length -1; q >=0; q--) {
                            filter.splice(toSplice[q],1);
                        }
                        rowQuery += "} on rows ";
                    } else {
                        rowQuery = "{[" + row[0] + "].[" + row[1] + "].children} on rows ";
                    }                    
                } else if(rows.length == 2) {
                    const row = rows[0].split(".");
                    const row1 = rows[1].split(".");
                    let toSplice = [];
                    if(filtHierarchy.includes(rows[0])) {
                        rowQuery += "{";
                        let a = 0;                        
                        for(let p = 0; p < leng; p++) {
                            if(filtSplit[p][0] == row[0] && filtSplit[p][1] == row[1]) {
                                if(a > 0) {
                                    rowQuery += ",";
                                }
                                rowQuery += "[" + row[0] + "].[" + row[1] + "].[" + filtSplit[p][2] + "]";
                                toSplice.push(p);
                                a++;
                            }
                        }                        
                        if(!filtHierarchy.includes(rows[1])) {
                            rowQuery += "}*[" + row1[0] + "].[" + row1[1] + "].children on rows ";
                        }
                        
                    }
                    if(filtHierarchy.includes(rows[1])) {
                        if(!filtHierarchy.includes(rows[0])) {
                            rowQuery += "[" + row[0] + "].[" + row[1] + "].children*";
                        }
                        rowQuery += "{";
                        let a = 0;                        
                        for(let r = 0; r < leng; r++) {
                            if(filtSplit[r][0] == row1[0] && filtSplit[r][1] == row1[1]) {
                                if(a > 0) {
                                    rowQuery += ",";
                                }
                                rowQuery += "[" + row1[0] + "].[" + row1[1] + "].[" + filtSplit[r][2] + "]";
                                toSplice.push(r);
                                a++;
                            }
                        }
                        rowQuery += "} on rows ";
                    }
                    for(let q = toSplice.length -1; q >=0; q--) {
                        filter.splice(toSplice[q],1);
                    }
                    if(!(filtHierarchy.includes(rows[0]) || filtHierarchy.includes(rows[1]))) {
                        rowQuery = "[" + row[0] + "].[" + row[1] + "].children*[" + row1[0] + "].[" + row1[1] + "].children on rows ";
                    }                    
                } else {
                    this.error("Either 1 or 2 rows must be given");
                }

                if(filter.length > 0) {
                    let checkHierarchy = [];
                    let alreadySeen = [];
                    let duplicateHierarchy = [];
                    let len = filter.length;
                    let filt = {};

                    // check for returning hierarchies
                    for(let j = 0; j < len; j++) {
                        filt[j] = filter[j].split(".");
                        checkHierarchy[j] = filt[j][0] + "." + filt[j][1];
                    }
                    let c=0;
                    checkHierarchy.forEach(function(str) {
                        if (alreadySeen[str]){
                            if(!duplicateHierarchy.includes(str)){
                                duplicateHierarchy[c] = str;
                                c++;
                            }
                        } else {
                            alreadySeen[str] = true;
                        }
                    });

                    // fill filterQuery string
                    filterQuery += " where (";
                    if(duplicateHierarchy.length > 0) {
                        for(let m = 0; m < c; m++) {
                            if(m > 0) {
                                filterQuery += ", ";
                            }
                            filterQuery += "{";
                            let duplCount = 0;
                            for(let k = 0; k < len; k++) {
                                if (duplicateHierarchy[m].includes(filt[k][0] + "." + filt[k][1])) {
                                    if(duplCount > 0) {
                                        filterQuery += ", ";
                                    }
                                    filterQuery += "[" + filt[k][0] + "].[" + filt[k][1] + "].[" + filt[k][2] + "]";
                                    duplCount++;
                                }
                            }
                            filterQuery += "}";
                        }
                    }
                    
                    for(let i = 0; i < len; i++) {
                        if (!duplicateHierarchy.includes(filt[i][0] + "." + filt[i][1])) {
                            if(filterQuery.length > 8) {
                                filterQuery += ", ";
                            }
                            filterQuery += "[" + filt[i][0] + "].[" + filt[i][1] + "].[" + filt[i][2] + "]";
                        }
                    }
                    filterQuery += ")";
                }

                query = columnQuery + rowQuery + "from [Model]" + filterQuery;
                
                OLAP.execute(this.connection, query).then(result => {
                    this.success(result);
                }).catch(e => {
                    const message = e.toString();
    
                    // Try and extract the error message
                    const match = message.match(/ERROR: (.*?)$/);
                    if (match && typeof match[1] == "string") {
                        this.error(match[1]);
                    } else {
                        this.error((e.stack || e).toString(), query);
                    }
                });
            } else {
                this.error("This is not a viable URL", null);
            }

        } else {
            this.error("This is not a viable URL", null);
        }
    }
}