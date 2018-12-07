// klasse voor de requests over pagina weergaven
class View {
    getResult(method, url, connection) {
        // path check: views per pagina
        if(url == "/view/{id}") {
            
            // method check
            if (method == "get") {
                // JSON object resultaat
                let resultObj = {
                    result: {
                        id: 1,
                        pageName: "Homepage",
                        amountViewed: 20
                    },
                    response: {
                        method: method.toUpperCase(),
                        url: url,
                        code: "200"
                    }
                };
                

                return resultObj;
            
            }
        }

        // path check: views alle pagina's
        if(url == "/views") {
        
            // method check
            if (method == "get") {

                // test query maken
                let query = `select

                [Measures].[Page View Count] on columns,
                NON EMPTY [Page].[Page].Children on rows 
            
                from [Model]`;

                // test query uitvoeren

                let result = "test";

                let resultObj = {
                    result: result
                };

                resultObj.response = {
                    method: method.toUpperCase(),
                    url: url,
                    code: "200"
                };
                
                return resultObj;
                
                

                // JSON array resultaat
                /*let resultObj = {
                    result: [ {
                        id: 1,
                        pageName: "Homepage",
                        amountViewed: 20
                    },
                    {
                        id: 2,
                        pageName: "About us",
                        amountViewed: 10
                    },
                    {
                        id: 3,
                        pageName: "Contact",
                        amountViewed: 15
                    } ],
                    response: {
                        method: method.toUpperCase(),
                        url: url,
                        code: "200"
                    }
                };*/
                

                //return resultObj;
            
            }
        }

    }
}