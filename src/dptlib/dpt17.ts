/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { DatapointConfig } from ".";

//
// DPT17: Scene number
//

// TODO: implement fromBuffer, formatAPDU

const config: DatapointConfig = {
  id: "DPT17",
  // DPT17 basetype info
  basetype: {
    bitlength: 8,
    valuetype: "basic",
    desc: "scene number",
  },
  // DPT17 subtypes
  subtypes: {
    // 17.001 Scene number
    "001": { use: "G", name: "DPT_SceneNumber", desc: "Scene Number" },
  },
};

export default config;
