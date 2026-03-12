// components/CRTWrapper.js
// N.U.K.A — CRT phosphor terminal effect wrapper
// Applies scanline overlay and vignette to any screen

import React from 'react';
import { View, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Colors from '../theme/colors';

export default function CRTWrapper({ children, style }) {
  return (
    <View style={[styles.container, style]}>
      {children}
      {/* Scanline overlay */}
      <View style={styles.scanlines} pointerEvents="none" />
      {/* Vignette overlay */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.5)']}
        style={styles.vignette}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    position: 'relative',
  },
  scanlines: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    // Scanlines simulated via repeating pattern
    // On Android use a semi-transparent striped overlay image
    // For now, subtle opacity reduction
    backgroundColor: 'rgba(0,0,0,0.04)',
    pointerEvents: 'none',
  },
  vignette: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'none',
  },
});
