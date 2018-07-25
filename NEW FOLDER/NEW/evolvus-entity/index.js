const debug = require("debug")("evolvus-contact:index");
const model = require("./model/entitySchema");
const db = require("./db/entitySchema");
const _ = require('lodash');
const collection = require("./db/entity");
const validate = require("jsonschema").validate;
const docketClient = require("evolvus-docket-client");
const randomString = require("randomstring");

var schema = model.schema;
var filterAttributes = model.filterAttributes;
var sortAttributes = model.sortableAttributes;

var docketObject = {
  // required fields
  contact: "PLATFORM",
  source: "contact",
  name: "",
  createdBy: "",
  ipAddress: "",
  status: "SUCCESS", //by default
  eventDateTime: Date.now(),
  keyDataAsJSON: "",
  details: "",
  //non required fields
  level: ""
};
module.exports = {
  model,
  db,
  filterAttributes,
  sortAttributes
};
module.exports.validate = (tenantId, entityObject) => {
  return new Promise((resolve, reject) => {
    try {
      if (typeof entityObject === "undefined") {
        throw new Error("IllegalArgumentException:entityObject is undefined");
      }
      let result = _.merge(entityObject, {
        "tenantId": tenantId
      });
      var res = validate(result, schema);
      debug("validation status: ", JSON.stringify(res));
      if (res.valid) {
        resolve(res.valid);
      } else {
        reject(res.errors);
      }
    } catch (err) {
      reject(err);
    }
  });
};


// tenantId cannot be null or undefined, InvalidArgumentError
// check if tenantId is valid from tenant table (todo)
//
// createdBy can be "System" - it cannot be validated against users
// ipAddress is needed for docket, must be passed
//
// object has all the attributes except tenantId, who columns
module.exports.save = (tenantId, entityId, accessLevel, entityObject) => {
  return new Promise((resolve, reject) => {
    try {
      if (typeof entityObject === 'undefined' || entityObject == null) {
        throw new Error("IllegalArgumentException: entityObject is null or undefined");
      }
      var res = validate(entityObject, schema);
      if (!res.valid) {
        if (res.errors[0].name == "required") {
          reject(`${res.errors[0].argument} is required`);
        }
        if (res.errors[0].name == "enum") {
          reject(`${res.errors[0].stack} `);
        }
        if (res.errors[0].name == "type") {
          reject(`${res.errors[0].stack} `);
        }
        if(res.errors[0].name== "maxLength"){
          reject(`${res.errors[0].property} exists maximum length `);
        }  else {
          reject(res.errors[0].schema.message);
        }
      } else {
        debug("validation status: ", JSON.stringify(res));
        collection.find(tenantId, entityId, accessLevel, {
          "name": entityObject.parent
        }, {}, 0, 1).then((result) => {
          if (_.isEmpty(result)) {
            throw new Error(`No ParentEntity found with ${entityObject.parent}`);
          }
          var randomId = randomString.generate(5);

          if (result[0].enableFlag == `1`) {
            var aces = parseInt(result[0].accessLevel) + 1;
            entityObject.accessLevel = JSON.stringify(aces);
            entityObject.entityId = result[0].entityId + randomId;

            entityObject.name = entityObject.name.toUpperCase();
            entityObject.entityCode = entityObject.entityCode.toUpperCase();

            Promise.all([collection.find(tenantId, entityId, accessLevel, {
                "name": entityObject.name,
              }, {}, 0, 1), collection.find(tenantId, entityId, accessLevel, {
                "entityCode": entityObject.entityCode
              }, {}, 0, 1)])
              .then((result) => {
                if (!_.isEmpty(result[0][0])) {
                  throw new Error(`Entity ${entityObject.name} already exists`);
                }
                if (!_.isEmpty(result[1][0])) {
                  throw new Error(`Entity ${entityObject.entityCode} already exists`);
                }
                // if the object is valid, save the object to the database
                docketObject.name = "entity_save";
                docketObject.keyDataAsJSON = JSON.stringify(entityObject);
                docketObject.details = `entity creation initiated`;
                docketClient.postToDocket(docketObject);

                console.log("entityObjecttttt", entityObject);
                collection.save(tenantId, entityObject).then((result) => {
                  debug(`saved successfully ${result}`);
                  resolve(result);
                }).catch((e) => {
                  console.log(e, "eerrrr");
                  debug(`failed to save with an error: ${e}`);
                  reject(e);
                });

              }).catch((e) => {
                console.log(e, "errrrrrrrrrrrrrrr");
                reject(e);
              });
          } else {
            throw new Error(`ParentEntity is disabled`);
          }
        }).catch((e) => {
          console.log(e);
          reject(e);
        });
      }
    } catch (e) {
      console.log(e);
      debug(`caught exception ${e}`);
      reject(e);
    }
  });
};

// tenantId should be valid
// createdBy should be requested user, not database object user, used for auditObject
// ipAddress should ipAddress
// filter should only have fields which are marked as filterable in the model Schema
// orderby should only have fields which are marked as sortable in the model Schema
module.exports.find = (tenantId, entityId, accessLevel, filter, orderby, skipCount, limit) => {
  return new Promise((resolve, reject) => {
    console.log(skipCount,"skipCount in index");
    console.log(limit,"limit in index");
    try {
      if(skipCount<0){
          throw new Error("skipCount must be positive value or 0");
      }
      var invalidFilters = _.difference(_.keys(filter), filterAttributes);
      collection.find(tenantId, entityId, accessLevel, filter, orderby, skipCount, limit).then((docs) => {
        debug(`menu(s) stored in the database are ${docs}`);
        resolve(docs);
      }).catch((e) => {
        debug(`failed to find all the menu(s) ${e}`);
        reject(e);
      });
    } catch (e) {
      reject(e);
    }
  });
};

// tenantId should be valid
module.exports.update = (tenantId, code, update) => {
  return new Promise((resolve, reject) => {
    try {
      if (code == null || update == null) {
        throw new Error("IllegalArgumentException:tenantId/code/update is null or undefined");
      }
      collection.update(tenantId, code, update).then((resp) => {
        debug("updated successfully", resp);
        resolve(resp);
      }).catch((error) => {
        debug(`failed to update ${error}`);
        reject(error);
      });
    } catch (e) {
      debug(`caught exception ${e}`);
      reject(e);
    }
  });
};

module.exports.counts = (tenantId, entityId, accessLevel, countQuery) => {
  return new Promise((resolve, reject) => {
    try {
      collection.counts(tenantId, entityId, accessLevel, countQuery).then((entityCount) => {
        if (entityCount > 0) {
          debug(`entityCount Data is ${entityCount}`);
          resolve(entityCount);
        } else {
          debug(`No entity count data available for filter query ${entityCount}`);
          resolve(0);
        }
      }).catch((e) => {
        debug(`failed to find ${e}`);
      });
    } catch (e) {
      debug(`caught exception ${e}`);
      reject(e);
    }
  });
};
