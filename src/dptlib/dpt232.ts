/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2019 Elias Karakoulakis
 */

import logger from "../KnxLog";
import { DatapointConfig } from ".";

const log = logger.get();

//
// DPT232: 3-byte RGB color array
// MSB: Red, Green, LSB: Blue
//
const config: DatapointConfig = {
  id: "dpt232",
  formatAPDU: (value) => {
    if (value == null) return log.error("DPT232: cannot write null value");

    if (typeof value === "object") {
      const { red, green, blue } = value;
      if (
        red >= 0 &&
        red <= 255 &&
        green >= 0 &&
        green <= 255 &&
        blue >= 0 &&
        blue <= 255
      )
        return Buffer.from([red, green, blue]);
    }
    log.error(
      "DPT232: Must supply an value {red:0..255, green:0.255, blue:0.255}"
    );
  },

  fromBuffer: (buf) => {
    const [red, green, blue] = buf;
    return { red, green, blue };
  },
  basetype: {
    bitlength: 3 * 8,
    valuetype: "basic",
    desc: "RGB array",
  },

  subtypes: {
    600: {
      name: "RGB",
      desc: "RGB color triplet",
      unit: "",
      scalar_range: [undefined, undefined],
      range: [undefined, undefined],
    },
  },
};

export default config;
