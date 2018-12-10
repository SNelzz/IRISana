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

        // Path parameters
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
                        this.error((e.stack || e).toString(), query);
                    });
                    
                } else if(url == "/facts/{fact}/measures") {                    
                    OLAP.getMeasuresByFact(this.connection, fact).then(result => {
                        this.success(result);
                    }).catch(e => {
                        this.error((e.stack || e).toString(), query);
                    });

                } else if(url == "/facts/{fact}/dimensions") {
                    OLAP.getDimensionsByFact(this.connection, fact).then(result => {
                        this.success(result);
                    }).catch(e => {
                        this.error((e.stack || e).toString(), query);
                    });

                } else if(url == "/facts/{fact}/dimensions/{dimension}/hierarchies") {
                    OLAP.getHierarchiesByDimension(this.connection, dimension).then(result => {
                        this.success(result);
                    }).catch(e => {
                    this.error((e.stack || e).toString(), query);
                    });

                } else if(url == "/facts/{fact}/dimensions/{dimension}/hierarchies/{hierarchy}/members") {
                    OLAP.getMembers(this.connection, dimension, hierarchy).then(result => {
                        this.success(result);
                    }).catch(e => {
                        this.error((e.stack || e).toString(), query);
                    });
                }

            } else if (url.includes("graph")) {

                // Extract the URL parameters
                const fact = params["fact"].replace(/-/g, " ");
                const columns = params["columns"].replace(/-/g, " ").split(",");
                const rows = params["rows"].replace(/-/g, " ").split(",");
                let nonEmpty = false;
                nonEmpty = params["nonEmpty"];
                let filter = [];               
                if(params["filter"] != null) {
                   filter = params["filter"].replace(/-/g, " ").split(",");
                }

                // Create a string to select the requested columns
                const createSelectColumns = function() {  
                    let columnQuery = "";             
                    if(columns.length == 1) {
                        columnQuery = "select {[Measures].[" + columns[0] + "]} on columns, ";

                    } else if (columns.length == 2) {
                        columnQuery = "select {[Measures].[" + columns[0] + "], [Measures].[" + columns[1] + "]} on columns, ";
                    } else {
                        this.error("Either 1 or 2 columns must be given");
                    }
                    return columnQuery;
                }

                // Create a string to select the requested rows. Filter the rows if included in the filter parameter.
                const createSelectRows = function(){
                    let filt = {};
                    let filterHierarchy = [];
                    let len = filter.length;
                    let rowQuery = "";
                    for(let n = 0; n < len; n++) {
                        filt[n] = filter[n].split(".");
                        filterHierarchy[n] = filt[n][0] + "." + filt[n][1];
                    }

                    if(nonEmpty) {
                        rowQuery += "NON EMPTY "
                    }

                    if(rows.length == 1) {
                        const row = rows[0].split(".");
                        // Check if row needs to be filtered
                        if(filterHierarchy.includes(rows[0])) {
                            rowQuery += "{";
                            let a = 0;
                            let toSplice = [];
                            for(let p = 0; p < len; p++) {
                                // Create select string for filtered row 
                                if(filt[p][0] == row[0] && filt[p][1] == row[1]) {
                                    if(a > 0) {
                                        rowQuery += ",";
                                    }
                                    rowQuery += "[" + row[0] + "].[" + row[1] + "].[" + filt[p][2] + "]";
                                    toSplice.push(p);
                                    a++;
                                }
                            }
                            // Delete all filtered rows out of list of items to be filtered. Going backwards through the array to prevent the index from changing before being deleted.
                            for(let q = toSplice.length -1; q >=0; q--) {
                                filter.splice(toSplice[q],1);
                            }
                            rowQuery += "} on rows ";
                        } else {
                            rowQuery += "{[" + row[0] + "].[" + row[1] + "].children} on rows ";
                        }                    
                    } else if(rows.length == 2) {
                        const row = rows[0].split(".");
                        const row1 = rows[1].split(".");
                        let toSplice = [];

                        // Check if the first row needs to be filtered
                        if(filterHierarchy.includes(rows[0])) {
                            rowQuery += "{";
                            let a = 0;                        
                            for(let p = 0; p < len; p++) {
                                // Create select string for filtered row with a set
                                if(filt[p][0] == row[0] && filt[p][1] == row[1]) {
                                    if(a > 0) {
                                        rowQuery += ",";
                                    }
                                    rowQuery += "[" + row[0] + "].[" + row[1] + "].[" + filt[p][2] + "]";
                                    toSplice.push(p);
                                    a++;
                                }
                            }
                            // Check if the second row needs to be filtered. If not then complete the row query string without a set
                            if(!filterHierarchy.includes(rows[1])) {
                                rowQuery += "}*[" + row1[0] + "].[" + row1[1] + "].children on rows ";
                            }
                            
                        }
                        // Check if the second row needs to be filtered
                        if(filterHierarchy.includes(rows[1])) {
                            // Check if the first row needs to be filtered. If not then include the first row query string without a set
                            if(!filterHierarchy.includes(rows[0])) {
                                rowQuery += "[" + row[0] + "].[" + row[1] + "].children*";
                            }
                            rowQuery += "{";
                            let a = 0;                        
                            for(let r = 0; r < len; r++) {
                                // Create select string for filtered row with a set
                                if(filt[r][0] == row1[0] && filt[r][1] == row1[1]) {
                                    if(a > 0) {
                                        rowQuery += ",";
                                    }
                                    rowQuery += "[" + row1[0] + "].[" + row1[1] + "].[" + filt[r][2] + "]";
                                    toSplice.push(r);
                                    a++;
                                }
                            }
                            rowQuery += "} on rows ";
                        }
                        // Delete all filtered rows from the list of items to be filtered. Going backwards through the array to prevent the index from changing before being deleted.
                        for(let q = toSplice.length -1; q >=0; q--) {
                            filter.splice(toSplice[q],1);
                        }
                        // Check if either row needs to be filtered. If not then create the row query string without sets.
                        if(!(filterHierarchy.includes(rows[0]) || filterHierarchy.includes(rows[1]))) {
                            rowQuery += "[" + row[0] + "].[" + row[1] + "].children*[" + row1[0] + "].[" + row1[1] + "].children on rows ";
                        }                    
                    } else {
                        this.error("Either 1 or 2 rows must be given");
                    }
                    return rowQuery;
                }

                const createWhere = function() {
                    let filterQuery = "";
                    if(filter.length > 0) {
                        
                        let checkHierarchy = [];
                        let alreadySeen = [];
                        let duplicateHierarchy = [];
                        let len = filter.length;
                        let filt = {};

                        // Check for returning hierarchies and save duplicates to an array
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

                        // Fill filterQuery string
                        filterQuery += " where (";
                        // Check for duplicates to make a set
                        if(duplicateHierarchy.length > 0) {
                            for(let m = 0; m < c; m++) {
                                if(m > 0) {
                                    filterQuery += ", ";
                                }
                                filterQuery += "{";
                                let duplCount = 0;
                                for(let k = 0; k < len; k++) {
                                    // Create query strings for filter parameters to put in a set
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
                        
                        // Create query strings for filter parameters without putting them in a set
                        for(let i = 0; i < len; i++) {
                            if (!duplicateHierarchy.includes(filt[i][0] + "." + filt[i][1])) {
                                if(filterQuery.length > 8) {
                                    filterQuery += ", ";
                                }
                                filterQuery += "[" + filt[i][0] + "].[" + filt[i][1] + "].[" + filt[i][2] + "]";
                            }
                        }
                        filterQuery += ")";

                        return filterQuery;
                    }
                    return filterQuery
                }

                let query = createSelectColumns() + createSelectRows() + "from [Model]" + createWhere();
                
                OLAP.execute(this.connection, query).then(result => {
                    this.success(result);
                }).catch(e => {
                    this.error((e.stack || e).toString(), query);
                });
            } else {
                this.error("This is not a viable URL", null);
            }

        } else {
            this.error("This is not a viable URL", null);
        }
    }
}