/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import logger from "../KnxLog";
import { DatapointConfig } from ".";
//
// DPT18: 8-bit Scene Control
//

/*
    class DPT18_Frame < DPTFrame
        bit1  :exec_learn, {
            :display_name : "Execute=0, Learn = 1"
        }
        bit1  :pad, {
            :display_name : "Reserved bit"
        }
        bit6  :data, {
            :display_name : "Scene number"
        }
    end
*/

// TODO: implement fromBuffer, formatAPDU

const log = logger.get();

const config: DatapointConfig = {
  id: "DPT18",
  formatAPDU: function (value) {
    if (value == null) log.warn("DPT18: cannot write null value");
    else {
      var apdu_data = Buffer.alloc(1);
      if (
        typeof value == "object" &&
        value.hasOwnProperty("save_recall") &&
        value.hasOwnProperty("scenenumber")
      ) {
        var sSceneNumberbinary = ((value.scenenumber - 1) >>> 0).toString(2);
        var sVal =
          value.save_recall + "0" + sSceneNumberbinary.padStart(6, "0");
        //console.log("BANANA SEND HEX " + sVal.toString("hex").toUpperCase())
        apdu_data[0] = parseInt(sVal, 2); // 0b10111111;
      } else {
        log.error(
          "DPT18: Must supply a value object of {save_recall, scenenumber}"
        );
      }
      return apdu_data;
    }
  },

  fromBuffer: function (buf) {
    //console.log("BANANA BUFF RECEIVE HEX " + buf.toString("hex").toUpperCase())
    if (buf.length != 1) {
      log.error("DP18: Buffer should be 1 byte long");
    } else {
      var sBit = parseInt(buf.toString("hex").toUpperCase(), 16)
        .toString(2)
        .padStart(8, "0"); // Get bit from hex
      //console.log("BANANA BUFF RECEIVE BIT " + sBit)
      return {
        save_recall: sBit.substring(0, 1),
        scenenumber: parseInt(sBit.substring(2), 2) + 1,
      };
    }
  },
  // DPT18 basetype info
  basetype: {
    bitlength: 8,
    valuetype: "composite",
    desc: "8-bit Scene Activate/Learn + number",
  },

  // DPT9 subtypes
  subtypes: {
    // 9.001 temperature (oC)
    "001": {
      name: "DPT_SceneControl",
      desc: "scene control",
    },
  },
};

export default config;

/*
02/April/2020 Supergiovane
USE:
Input must be an object: {save_recall, scenenumber}
save_recall: 0 = recall scene, 1 = save scene
scenenumber: the scene number, example 1
Example: {save_recall=0, scenenumber=2}
*/
