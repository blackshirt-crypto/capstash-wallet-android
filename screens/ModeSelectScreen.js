// screens/ModeSelectScreen.js
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import Colors from '../theme/colors';
import { Typography, Fonts } from '../theme/typography';
import {
  setAppMode, MODE_DRIFTER, MODE_WANDERER,
} from '../services/appMode';

export default function ModeSelectScreen({ onModeSelected }) {
  const [selecting, setSelecting] = useState(false);

  const handleSelect = async (mode) => {
    try {
      setSelecting(true);
      await setAppMode(mode);
      onModeSelected(mode);
    } catch (e) {
      console.error('[ModeSelect] handleSelect failed:', e.message);
      setSelecting(false);
      // Still proceed even if persist fails
      onModeSelected(mode);
    }
  };

  const handleWandererPress = () => {
    Alert.alert(
      'WANDERER MODE',
      'Wanderer runs a full CAP node on this device.\n\n' +
      'First sync may take several minutes.\n' +
      'Keep the app open during initial sync.\n\n' +
      'You can switch modes later in Settings\n' +
      '(WARNING: switching will reset local node data).',
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'ENTER WANDERER',
          onPress: () => handleSelect(MODE_WANDERER) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>☢ CAPSTASH</Text>
      <Text style={styles.subtitle}>CHOOSE YOUR WASTELAND</Text>

      <View style={styles.divider} />

      <TouchableOpacity
        style={styles.modeCard}
        onPress={() => handleSelect(MODE_DRIFTER)}
        disabled={selecting}
        activeOpacity={0.8}
      >
        <Text style={styles.modeTitle}>⬡ DRIFTER</Text>
        <Text style={styles.modeDesc}>CONNECT TO EXTERNAL NODE</Text>
        <Text style={styles.modeDetail}>
          MINE · EXPLORE · TRADE{'\n'}
          REQUIRES NODE ACCESS VIA TAILSCALE OR LOCAL IP
        </Text>
      </TouchableOpacity>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>OR</Text>
        <View style={styles.orLine} />
      </View>

      <TouchableOpacity
        style={[styles.modeCard, styles.modeCardWanderer]}
        onPress={handleWandererPress}
        disabled={selecting}
        activeOpacity={0.8}
      >
        <Text style={[styles.modeTitle, styles.modeTitleWanderer]}>☢ WANDERER</Text>
        <Text style={[styles.modeDesc, styles.modeDescWanderer]}>
          SELF-CONTAINED NODE ON DEVICE
        </Text>
        <Text style={[styles.modeDetail, styles.modeDetailWanderer]}>
          MINE · EXPLORE · TRADE · VALIDATE{'\n'}
          NO EXTERNAL CONNECTION REQUIRED
        </Text>
      </TouchableOpacity>

      {selecting && (
        <ActivityIndicator
          style={{ marginTop: 32 }}
          color={Colors.green}
          size="large"
        />
      )}

      <Text style={styles.footer}>
        SETTINGS → SWITCH MODE AT ANY TIME
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   Colors.black,
    paddingHorizontal: 24,
    paddingTop:        80,
    alignItems:        'center',
  },
  title: {
    fontFamily:    'ShareTechMono',
    fontSize:      28,
    color:         Colors.green,
    letterSpacing: 4,
    marginBottom:  8,
  },
  subtitle: {
    fontFamily:    'ShareTechMono',
    fontSize:      12,
    color:         Colors.greenDim,
    letterSpacing: 3,
    marginBottom:  32,
  },
  divider: {
    width:           '100%',
    height:          1,
    backgroundColor: Colors.green,
    opacity:         0.2,
    marginBottom:    32,
  },
  modeCard: {
    width:           '100%',
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    4,
    padding:         20,
    marginBottom:    8,
    backgroundColor: Colors.surface,
  },
  modeCardWanderer: {
    borderColor: Colors.green,
  },
  modeTitle: {
    fontFamily:    'ShareTechMono',
    fontSize:      16,
    color:         Colors.greenDim,
    letterSpacing: 2,
    marginBottom:  4,
  },
  modeTitleWanderer: {
    color: Colors.green,
  },
  modeDesc: {
    fontFamily:    'ShareTechMono',
    fontSize:      11,
    color:         Colors.greenDim,
    letterSpacing: 1.5,
    marginBottom:  8,
  },
  modeDescWanderer: {
    color:   Colors.green,
    opacity: 0.8,
  },
  modeDetail: {
    fontFamily:  'ShareTechMono',
    fontSize:    10,
    color:       Colors.greenDim,
    opacity:     0.6,
    letterSpacing: 1,
    lineHeight:  18,
  },
  modeDetailWanderer: {
    color:   Colors.green,
    opacity: 0.5,
  },
  orRow: {
    flexDirection: 'row',
    alignItems:    'center',
    width:         '100%',
    marginVertical: 12,
  },
  orLine: {
    flex:            1,
    height:          1,
    backgroundColor: Colors.border,
  },
  orText: {
    fontFamily:      'ShareTechMono',
    fontSize:        11,
    color:           Colors.greenDim,
    marginHorizontal: 12,
    letterSpacing:   2,
  },
  footer: {
    position:      'absolute',
    bottom:        32,
    fontFamily:    'ShareTechMono',
    fontSize:      10,
    color:         Colors.greenDim,
    opacity:       0.4,
    letterSpacing: 1,
  },
});