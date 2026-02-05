/**
 * knx.js - a KNX protocol stack in pure Javascript
 * (C) 2016-2018 Elias Karakoulakis
 */

const log = require('log-driver').logger;

//
// DPT14.*: 4-byte floating point value
//

/* In sharp contrast to DPT9 (16-bit floating point - JS spec does not support),
 *  the case for 32-bit floating point is simple...
 */

exports.formatAPDU = (value) => {
  if (value == null || typeof value != 'number')
    log.error('DPT14: Must supply a number value');
  const apdu_data = Buffer.alloc(4);
  apdu_data.writeFloatBE(value, 0);
  return apdu_data;
};

exports.fromBuffer = (buf) => {
  if (buf.length != 4) log.warn('DPT14: Buffer should be 4 bytes long');
  return buf.readFloatBE(0);
};

// DPT14 base type info
exports.basetype = {
  bitlength: 32,
  valuetype: 'basic',
  range: [0, Math.pow(2, 32)],
  desc: '32-bit floating point value',
};

// DPT14 subtypes info
exports.subtypes = {
  '000': {
    name: 'DPT_Value_Acceleration',
    desc: 'acceleration',
    unit: 'm/s²',
  },

  '001': {
    name: 'DPT_Value_Acceleration_Angular',
    desc: 'acceleration, angular',
    unit: 'rad/s²',
  },

  '002': {
    name: 'DPT_Value_Activation_Energy',
    desc: 'activation energy',
    unit: 'J/mol',
  },

  '003': {
    name: 'DPT_Value_Activity',
    desc: 'activity (radioactive)',
    unit: '1/s',
  },

  '004': {
    name: 'DPT_Value_Mol',
    desc: 'amount of substance',
    unit: 'mol',
  },

  '005': {
    name: 'DPT_Value_Amplitude',
    desc: 'amplitude',
  },

  '006': {
    name: 'DPT_Value_AngleRad',
    desc: 'angle, radiant',
    unit: 'rad'
  },
  
  '007': {
    name: 'DPT_Value_AngleDeg°',
    desc: 'angle, degree',
    unit: '°',
  },

  '008': {
    name: 'DPT_Value_Angular_Momentum',
    desc: 'angular momentum',
    unit: 'Js',
  },

  '009': {
    name: 'DPT_Value_Angular_Velocity',
    desc: 'angular velocity',
    unit: 'rad/s',
  },

  '010': {
    name: 'DPT_Value_Area',
    desc: 'area',
    unit: 'm²',
  },

  '011': {
    name: 'DPT_Value_Capacitance',
    desc: 'capacitance',
    unit: 'F',
  },

  '012': {
    name: 'DPT_Value_Charge_DensitySurface',
    desc: 'charge density (surface)',
    unit: '1/m²',
  },

  '0013': {
    name: 'DPT_Value_Charge_DensityVolume',
    desc: 'charge density (volume)',
    unit: '1/m³',
  },
  
  '014': {
    name: 'DPT_Value_Compressibility',
    desc: 'compressibility',
    unit: 'm²',
  },

  '015': {
    name: 'DPT_Value_Conductance',
    desc: 'conductance',
    unit: 'S',
  },

  '016': {
    name: 'DPT_Value_Electrical_Conductivity',
    desc: 'conductivity, electrical',
    unit: 'S/m',
  },

  '017': {
    name: 'DPT_Value_Density',
    desc: 'density',
    unit: '1/m³',
  },

  '018': {
    name: 'DPT_Value_Electric_Charge',
    desc: 'electric charge',
    unit: 'C',
  },

  '019': {
    name: 'DPT_Value_Electric_Current',
    desc: 'electric current',
    unit: 'A',
  },

  '020': {
    name: 'DPT_Value_Electric_CurrentDensity',
    desc: 'electric current density',
    unit: 'A/m²',
  },

  '021': {
    name: 'DPT_Value_Electric_DipoleMoment',
    desc: 'electric dipole moment',
    unit: 'Cm',
  },

  '022': {
    name: 'DPT_Value_Electric_Displacement',
    desc: 'electric displacement',
    unit: 'C/m²',
  },

  '023': {
    name: 'DPT_Value_Electric_FieldStrength',
    desc: 'electric field strength',
    unit: 'V/m',
  },

  '024': {
    name: 'DPT_Value_Electric_Flux',
    desc: 'electric flux',
    unit: 'c',
  },

  '025': {
    name: 'DPT_Value_Electric_FluxDensity',
    desc: 'electric flux density',
    unit: 'C/m²',
  },

  '026': {
    name: 'DPT_Value_Electric_Polarization',
    desc: 'electric polarization',
    unit: 'C/m²',
  },

  '027': {
    name: 'DPT_Value_Electric_Potential',
    desc: 'electric potential',
    unit: 'V',
  },

  '028': {
    name: 'DPT_Value_Electric_PotentialDifference',
    desc: 'electric potential difference',
    unit: 'V',
  },

  '029': {
    name: 'DPT_Value_ElectromagneticMoment',
    desc: 'electromagnetic moment',
    unit: 'A/m²',
  },

  '030': {
    name: 'DPT_Value_Electromotive_Force',
    desc: 'electromotive force',
    unit: 'V',
  },

  '031': {
    name: 'DPT_Value_Energ',
    desc: 'energy',
    unit: 'J',
  },

  '032': {
    name: 'DPT_Value_Force',
    desc: 'force',
    unit: 'N',
  },

  '033': {
    name: 'DPT_Value_Frequency',
    desc: 'frequency',
    unit: 'Hz',
  },

  '034': {
    name: 'DPT_Value_Angular_Frequency',
    desc: 'frequency, angular (pulsatance)',
    unit: 'rad/s',
  },

  '035': {
    name: 'DPT_Value_Heat_Capacity',
    desc: 'heat capacity',
    unit: 'J/K',
  },

  '036': {
    name: 'DPT_Value_Heat_FlowRate',
    desc: 'heat flow rate',
    unit: 'W',
  },

  '037': {
    name: 'DPT_Value_Heat_Quantity',
    desc: 'heat, quantity of',
    unit: 'J',
  },

  '038': {
    name: 'DPT_Value_Impedance',
    desc: 'impedance',
    unit: 'Ω',
  },

  '039': {
    name: 'DPT_Value_Length',
    desc: 'length',
    unit: 'm',
  },

  '040': {
    name: 'DPT_Value_Light_Quantity',
    desc: 'light, quantity',
    unit: 'J',
  },

  '041': {
    name: 'DPT_Value_Luminance',
    desc: 'luminance',
    unit: 'cd/m²',
  },

  '042': {
    name: 'DPT_Value_Luminous_Flux',
    desc: 'luminous flux',
    unit: 'lm',
  },

  '043': {
    name: 'DPT_Value_Luminous_Intensity',
    desc: 'luminous intensity',
    unit: 'cd',
  },
  
  '044': {
    name: 'DPT_Value_Magnetic_FieldStrength',
    desc: 'magnetic field strength',
    unit: 'A/m',
  },

  '045': {
    name: 'DPT_Value_Magnetic_Flux',
    desc: 'magnetic flux',
    unit: 'Wb',
  },

  '046': {
    name: 'DPT_Value_Magnetic_FluxDensity',
    desc: 'magnetic flux density',
    unit: 'T',
  },

  '047': {
    name: 'DPT_Value_Magnetic_Moment',
    desc: 'magnetic moment',
    unit: 'Am²',
  },

  '048': {
    name: 'DPT_Value_Magnetic_Polarization',
    desc: 'agnetic polarization',
    unit: 'T',
  },
  
  '049': {
    name: 'DPT_Value_Magnetization',
    desc: 'magnetization',
    unit: 'A/m',
  },
  
  '050': {
    name: 'DPT_Value_MagnetomotiveForce',
    desc: 'magneto motive force',
    unit: 'A',
  },

  '051': {
    name: 'DPT_Value_Mass',
    desc: 'mass',
    unit: 'kg',
  },

  '052': {
    name: 'DPT_Value_MassFlux',
    desc: 'mass flux',
    unit: 'kg/s'
  },

  '053': {
    name: 'DPT_Value_Momentum',
    desc: 'momentum',
    unit: "N/s"
  },

  '054': {
    name: 'DPT_Value_Phase_AngleRad',
    desc: 'phase angle, radiant',
    unit: 'rad'
  },

  '055': {
    name: 'DPT_Value_Phase_AngleDeg',
    desc: 'phase angle, degrees',
    unit: '°'
  },

  '056': {
    name: 'DPT_Value_Power',
    desc: 'power',
    unit: 'W',
  },

  '057': {
    name: 'DPT_Value_Power_Factor',
    desc: 'power factor',
  },

  '058': {
    name: 'DPT_Value_Pressure',
    desc: 'pressure',
    unit: 'Pa'
  },

  '059': {
    name: 'DPT_Value_Reactance',
    desc: 'reactance',
    unit: 'Ω'
  },

  '060': {
    name: 'DPT_Value_Resistance',
    desc: 'resistance',
    unit: 'Ω'
  },

  '061': {
    name: 'DPT_Value_Resistivity',
    desc: 'resistivity',
    unit: 'Ωm'
  },

  '062': {
    name: 'DPT_Value_SelfInductance',
    desc: 'self inductance',
    unit: 'H'
  },

  '063': {
    name: 'DPT_Value_SolidAngle',
    desc: 'solid angle',
    unit: 'sr'
  },

  '064': {
    name: 'DPT_Value_Sound_Intensity',
    desc: 'sound intensity',
    unit: 'sr'
  },

  '065': {
    name: 'DPT_Value_Speed',
    desc: 'speed',
    unit: 'm/s',
  },

  '066': {
    name: 'DPT_Value_Stress',
    desc: 'stress',
    unit: 'Pa',
  },

  '067': {
    name: 'DPT_Value_Surface_Tension',
    desc: 'surface tension',
    unit: '1/Nm',
  },

  '068': {
    name: 'DPT_Value_Common_Temperature',
    desc: 'temperature, common',
    unit: '°C',
  },

  '069': {
    name: 'DPT_Value_Absolute_Temperature',
    desc: 'temperature (absolute)',
    unit: 'K',
  },

  '070': {
    name: 'DPT_Value_TemperatureDifference',
    desc: 'temperature difference',
    unit: 'K',
  },

  '071': {
    name: 'DPT_Value_Thermal_Capacity',
    desc: 'thermal capacity',
    unit: 'J/K'
  },

  '072': {
    name: 'DPT_Value_Thermal_Conductivity',
    desc: 'thermal conductivity',
    unit: 'W/(mK)'
  },
  
  '073': {
    name: 'DPT_Value_ThermoelectricPower',
    desc: 'thermoelectric power',
    unit: "V/K"
  },
  
  '074': {
    name: 'DPT_Value_Time',
    desc: 'time',
    unit: 's'
  },
  
  '075': {
    name: 'DPT_Value_Torque',
    desc: 'torque',
    unit: 'Nm'
  },
  
  '076': {
    name: 'DPT_Value_Volume',
    desc: 'volume',
    unit: 'm³'
  },
  
  '077': {
    name: 'DPT_Value_Volume_Flux',
    desc: 'volume flux',
    unit: 'm³/s'
  },

  '078': {
    name: 'DPT_Value_Weight',
    desc: 'weight',
    unit: 'N',
  },

  '079': {
    name: 'DPT_Value_Work',
    desc: 'work',
    unit: 'J',
  },

  '080': {
    name: 'DPT_Value_ApparentPower',
    desc: 'Apparent power',
    unit: 'VA',
  },
};
