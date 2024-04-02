/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

import { DatapointConfig } from ".";
import KnxLog from "../KnxLog";

const log = KnxLog.get();

interface Dpt2Value {
  priority: boolean | number;
  data: boolean | number;
}

const config: DatapointConfig = {
  id: "dpt2",

  // DPT2 frame description.
  // Always 8-bit aligned.
  formatAPDU: (value: Dpt2Value) => {
    if (value == null) return log.error("DPT2: cannot write null value");

    if (
      typeof value === "object" &&
      value.hasOwnProperty("priority") &&
      value.hasOwnProperty("data")
    )
      return Buffer.from([
        ((value.priority as number) << 1) + (value.data as number & 0b00000001),
      ]);

    log.error("DPT2: Must supply an value {priority:<bool>, data:<bool>}");
    // FIXME: should this return zero buffer when error? Or nothing?
    return Buffer.from([0]);
  },

  fromBuffer: (buf) => {
    if (buf.length !== 1) return log.error("Buffer should be 1 byte long");

    return {
      priority: (buf[0] & 0b00000010) >> 1,
      data: buf[0] & 0b00000001,
    };
  },

  // DPT basetype info hash
  basetype: {
    bitlength: 2,
    valuetype: "composite",
    desc: "1-bit value with priority",
  },

  // DPT subtypes info hash
  subtypes: {
    // 2.001 switch control
    "001": {
      use: "G",
      name: "DPT_Switch_Control",
      desc: "switch with priority",
      enc: { 0: "Off", 1: "On" },
    },
    // 2.002 boolean control
    "002": {
      use: "G",
      name: "DPT_Bool_Control",
      desc: "boolean with priority",
      enc: { 0: "false", 1: "true" },
    },
    // 2.003 enable control
    "003": {
      use: "FB",
      name: "DPT_Emable_Control",
      desc: "enable with priority",
      enc: { 0: "Disabled", 1: "Enabled" },
    },

    // 2.004 ramp control
    "004": {
      use: "FB",
      name: "DPT_Ramp_Control",
      desc: "ramp with priority",
      enc: { 0: "No ramp", 1: "Ramp" },
    },

    // 2.005 alarm control
    "005": {
      use: "FB",
      name: "DPT_Alarm_Control",
      desc: "alarm with priority",
      enc: { 0: "No alarm", 1: "Alarm" },
    },

    // 2.006 binary value control
    "006": {
      use: "FB",
      name: "DPT_BinaryValue_Control",
      desc: "binary value with priority",
      enc: { 0: "Off", 1: "On" },
    },

    // 2.007 step control
    "007": {
      use: "FB",
      name: "DPT_Step_Control",
      desc: "step with priority",
      enc: { 0: "Off", 1: "On" },
    },

    // 2.008 Direction1 control
    "008": {
      use: "FB",
      name: "DPT_Direction1_Control",
      desc: "direction 1 with priority",
      enc: { 0: "Off", 1: "On" },
    },

    // 2.009 Direction2 control
    "009": {
      use: "FB",
      name: "DPT_Direction2_Control",
      desc: "direction 2 with priority",
      enc: { 0: "Off", 1: "On" },
    },

    // 2.010 start control
    "010": {
      use: "FB",
      name: "DPT_Start_Control",
      desc: "start with priority",
      enc: { 0: "No control", 1: "No control", 2: "Off", 3: "On" },
    },

    // 2.011 state control
    "011": {
      use: "FB",
      name: "DPT_Switch_Control",
      desc: "switch",
      enc: { 0: "No control", 1: "No control", 2: "Off", 3: "On" },
    },

    // 2.012 invert control
    "012": {
      use: "FB",
      name: "DPT_Switch_Control",
      desc: "switch",
      enc: { 0: "No control", 1: "No control", 2: "Off", 3: "On" },
    },
  },
};

export default config;
