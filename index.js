'use strict'

const redis_url = process.env.REDIS_URL || 'localhost';
const redis_password = process.env.REDIS_PASSWORD;

const express = require('express');
const app = express();

const bodyParser = require('body-parser');

const redis = require("redis");

const genericPool = require("generic-pool");

const factory = {
    create: () => {
        return redis.createClient(6379, redis_url, {
            password: redis_password
        });
    },
    destroy: (client) => {
        client.quit();
    }
};

const opts = {
    max: 1000,
    min: 5,
};

const pool = genericPool.createPool(factory, opts);

async function prepareDatabase() {
    let client = await pool.acquire();
    
    createDatabase(client);
    createTables(client);
    createStatements(client);
    
    pool.release(client);
}

function createDatabase(client) {
    client.send_command(
        "REDISQL.CREATE_DB", 
        ["DB"],
        (err, _) => {
            if (err) {
                console.log("Error in creating the database: ", err.message);
            } else {
                console.log("Database created");
            }
        });
}

function createTables(client) {
    let statement = `CREATE TABLE IF NOT EXISTS namespace ( 
            namespace TEXT PRIMARY KEY 
        ); 

        CREATE TABLE IF NOT EXISTS json_data (
            namespace STRING,
            object_name STRING,
            data JSON,
            PRIMARY KEY (namespace, object_name),
            FOREIGN KEY(namespace) REFERENCES namespace(namespace) ON UPDATE CASCADE ON DELETE CASCADE
        );`;
    client.send_command(
        "REDISQL.EXEC",
        ["DB", statement],
        (err, _) => {
            if (err) {
                console.log("Error in creating the tables: ", err.message);
            } else {
                console.log("Table created");
            }
        }
    );
}

function createStatements(client) {
    let statements = {
        "create_namespace": `INSERT INTO namespace VALUES(?1);`,
        "upsert_object": `INSERT OR REPLACE 
                            INTO json_data (namespace, object_name, data)
                            VALUES (?1, ?2, json(?3))`,
        "get_object": `SELECT data 
                        FROM json_data 
                        WHERE namespace = ?1 AND
                        object_name = ?2;`,
        "extract": `SELECT json_extract(data, ?3) 
                        FROM json_data 
                        WHERE namespace = ?1 AND 
                        object_name = ?2;`,
        "insert": `UPDATE json_data 
                        SET data = json_insert(json(data), ?3, json(?4))
                        WHERE namespace = ?1 AND 
                        object_name = ?2 AND
                        data != json_insert(json(data), ?3, json(?4));`,
        "patch": `UPDATE json_data
                        SET data = json_patch(data, json(?3))
                        WHERE namespace = ?1 AND 
                        object_name = ?2 AND
                        data != json_patch(data, json(?3));`,
        "remove": `UPDATE json_data
                        SET data = json_remove(data, ?3)
                        WHERE namespace = ?1 AND 
                        object_name = ?2 AND
                        data != json_remove(data, ?3);`,
        "replace":`UPDATE json_data 
                        SET data = json_replace(json(data), ?3, json(?4))
                        WHERE namespace = ?1 AND 
                        object_name = ?2 AND
                        data != json_replace(json(data), ?3, json(?4));`,
        "set": `UPDATE json_data 
                        SET data = json_set(data, ?3, json(?4))
                        WHERE namespace = ?1 AND 
                        object_name = ?2 AND
                        data != json_set(data, ?3, json(?4));`
    };
    for (var key in statements) {
        let stmt = key;
        let query = statements[key];
        client.send_command(
            "REDISQL.CREATE_STATEMENT",
            ["DB", stmt, query],
            (err, res) => {
                if (err) {
                    console.log(err);
                    client.send_command(
                        "REDISQL.UPDATE_STATEMENT",
                        ["DB", stmt, query],
                        (err,res) => {
                            if (err) {
                                console.log("Impossible to create or update the statement: ", stmt);
                                console.log(err.message);
                            } else {
                                console.log("Update statement: ", stmt);
                            }
                        } 
                    );
                } else {
                    console.log(res);
                    console.log("Create statement: ", stmt);
                }
            });
    }
}

function formatCallBackResult(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };
}

function returnError(err, res) {
    console.log(err);
    console.log(err.message);
    const error = {
        "status": "error",
        "message": err.message
    };
    res.status(400).json(error);
}

async function createNewNamespace(namespace, res) {
    console.log("Creating new namespace");
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT", 
        ["DB", "create_namespace", namespace],
        function(err, result) {
            pool.release(client);
            if (err) {
                returnError(err, res);
            } else {
                const success = {
                    "status": "success",
                    "message": "namespace correctly created"
                };
                res.status(201).json(success);
            }
        });
}

async function getObject(namespace, obj, res) {
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "get_object", namespace, obj],
        function(err, result){
            pool.release(client);
            if (err) {
                returnError(err, res);
            } else {
                console.log(result);
                const result_obj = JSON.parse(result);
                res.status(200).json(result_obj);
            }
        }
    );
}

async function createObject(namespace, obj, body, res) {
    let json = body;
    let client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "upsert_object", namespace, obj, JSON.stringify(json)],
        function(err, result) {
            pool.release(client);
            if (err) {
                returnError(err, res);
            } else {
                console.log("Pre result");
                const result_obj = {
                    "status": "success",
                    "message": "created new object",
                    "namespace": namespace,
                    "obj": obj,
                    "object": body
                };
                console.log(result_obj);
                res.status(201).json(result_obj);
            }
        }
    );
    return;
}

function missingKeyError(missingKey, res) {
    const error_message = "Necessary the \"" + missingKey + "\" key in the JSON body of the request";
    returnError(error_message, res);
}

async function extract(namespace, obj, path, res){
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT", 
        ["DB", "extract", namespace, obj, path],
        function(err, result) {
            pool.release(client);
            if (err) {
                returnError(err, res);
                return;
            }
            if (result[0][0] == null) {
                const error_message = "The path provide does not match inside the JSON object";
                returnError(error_message, res);
                return;
            }
            const string_result = result[0][0];
            const result_obj = {
                status: 'success',
                result: string_result
            };
            res.status(200).json(result_obj);
            return;
        }
    );
    return;
}

async function insert(namespace, obj, path, value, res) {
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "insert", namespace, obj, path, JSON.stringifY(value)],
        function(err, result) {
            pool.release(client);
            console.log("Error: ", err);
            console.log("Result: ", result);
            if (err) {
                returnError(err, res);
                return;
            }
            if (result[1] == 0) {
                const error_message = "Value not modified, either the path is wrong or the couple namespace/obj"
                returnError(error_message, res);
                return;
            }
            const result_obj = {message: "Insert executed, and value modified."};
            res.status(200).json(result_obj);
            return;
        }
    );
    return;
}

async function patch(namespace, obj, value, res){
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "patch", namespace, obj, JSON.stringify(value)],
        function(err, result) {
            pool.release(client);
            if (err) {
                returnError(err, res);
                return;
            }
            if (result[1] == 0) {
                const error_message = "Value not modified, either the path is wrong or the couple namespace/obj"
                returnError(error_message, res);
                return;
            }
            const result_obj = {message: "Path executed, and value modified."};
            res.status(200).json(result_obj);
            return;
         }
    );
    return;
}

async function remove(namespace, obj, path, res){
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "remove", namespace, obj, path],
        function(err, result) {
            pool.release(client);
            if (err) {
                returnError(err, res);
                return;
            }
            if (result[1] == 0) {
                const error_message = "Value not modified, either the path is wrong or the couple namespace/obj"
                returnError(error_message, res);
                return;
            }
            const result_obj = {message: "Remove executed, and value modified."};
            res.status(200).json(result_obj);
            return;
         }
    );
    return;
}

async function replace(namespace, obj, path, value, res) {
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "replace". namespace, obj, path, JSON.stringify(value)],
        function(err, result) {
            pool.release(client);
            console.log("Error: ", err);
            console.log("Result: ", result);
            if (err) {
                returnError(err, res);
                return;
            }
            if (result[1] == 0) {
                const error_message = "Value not modified, either the path is wrong or the couple namespace/obj"
                returnError(error_message, res);
                return;
            }
            const result_obj = {message: "Replace executed, and value modified."};
            res.status(200).json(result_obj);
            return;
        }
    );
    return;
}

async function set(namespace, obj, path, value, res) {
    const client = await pool.acquire();
    client.send_command(
        "REDISQL.EXEC_STATEMENT",
        ["DB", "set", namespace, obj, path, JSON.stringify(value)],
        function(err, result) {
            pool.release(client);
            console.log("Error: ", err);
            console.log("Result: ", result);
            if (err) {
                returnError(err, res);
                return;
            }
            if (result[1] == 0) {
                const error_message = "Value not modified, either the path is wrong or the couple namespace/obj"
                returnError(error_message, res);
                return;
            }
            const result_obj = {message: "Set executed, and value modified."};
            res.status(200).json(result_obj);
            return;
        }
    );
    return;
}

function patchObject(namespace, obj, action, res) {
    let jsonAction = action;

    if (!("action" in jsonAction)) {
        missingKeyError("action", res);
        return;
    }
    switch (jsonAction.action) {
        case "extract":
            if (!("path" in jsonAction)) {
                missingKeyError("path", res);
                return;
            }
            extract(namespace, obj, jsonAction.path, res);
            break;
        case "insert":
            if (!("path" in jsonAction)) {
                missingKeyError("path", res);
                return;
            }
            if (!("value" in jsonAction)) {
                missingKeyError("value", res);
                return;
            }
            insert(namespace, obj, jsonAction.path, jsonAction.value, res);
            break;
        case "patch":
            if (!("value" in jsonAction)) {
                missingKeyError("value", res);
                return;
            }
            patch(namespace, obj, jsonAction.value, res);
            break;
        case "remove":
            if (!("path" in jsonAction)) {
                missingKeyError("path", res);
                return;
            }
            remove(namespace, obj, jsonAction.path, res);
            break;
        case "replace":
            if (!("path" in jsonAction)) {
                missingKeyError("path", res);
                return;
            }
            if (!("value" in jsonAction)) {
                missingKeyError("value", res);
                return;
            }
            replace(namespace, obj, jsonAction.path, jsonAction.value, res);
            break;
        case "set":
            if (!("path" in jsonAction)) {
                missingKeyError("path", res);
                return;
            }
            if (!("value" in jsonAction)) {
                missingKeyError("value", res);
                return;
            }
            set(namespace, obj, jsonAction.path, jsonAction.value, res);
            break;
        default:
            const error_message = "The \"action\" key in the JSON body \
                of the request must be one of the following: \"extract\" \
                \"insert\", \"patch\", \"remove\", \"replace\" or \"set\"";
            returnError(error_message, res);
            break;
    }
    return;
}

app.use(bodyParser.json());

app.put('/:namespace', (req, res) => {
    let namespace = req.params['namespace'];
    createNewNamespace(namespace, res);
});

app.get('/:namespace/:obj', (req, res) => {
    let namespace = req.params['namespace'];
    let obj = req.params['obj'];
    getObject(namespace, obj, res);
});

app.put('/:namespace/:obj', (req, res) => {
    console.log(req.body);
    let namespace = req.params['namespace'];
    let obj = req.params['obj'];
    createObject(namespace, obj, req.body, res);
});

app.patch('/:namespace/:obj', (req, res) => {
    console.log(req.body);
    let namespace = req.params['namespace'];
    let obj = req.params['obj'];
    patchObject(namespace, obj, req.body, res);
})

app.listen(3000, () => {
    prepareDatabase();
    console.log("Start listening on port 3000");
});
