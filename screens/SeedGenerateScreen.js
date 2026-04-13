// screens/SeedGenerateScreen.js
// Wanderer first-launch — generate and display 12-word BIP39 seed phrase
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { Buffer } from 'buffer';
global.Buffer = Buffer;
import * as bip39 from 'bip39';
import Colors from '../theme/colors';

export default function SeedGenerateScreen({ onSeedConfirmed, onRestoreInstead }) {
  const [mnemonic, setMnemonic] = useState('');
  const [words,    setWords]    = useState([]);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const m = bip39.generateMnemonic(128); // 12 words
    setMnemonic(m);
    setWords(m.split(' '));
  }, []);

  const handleReveal = () => setRevealed(true);

  const handleContinue = () => {
    if (!revealed) {
      Alert.alert(
        'READ YOUR SEED PHRASE',
        'You must reveal and write down your seed phrase before continuing.',
        [{ text: 'OK' }]
      );
      return;
    }
    Alert.alert(
      '⚠ WARNING — LAST CHANCE',
      'Have you written down all 12 words in order?\n\n' +
      'If you lose your seed phrase, your CAP cannot be recovered.\n\n' +
      'There is no password reset. There is no support ticket.\n' +
      'The wasteland keeps what you lose.',
      [
        { text: 'GO BACK', style: 'cancel' },
        { text: 'I WROTE IT DOWN', onPress: () => onSeedConfirmed(mnemonic) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>☢ WANDERER SETUP</Text>
      <Text style={styles.subtitle}>VAULT KEY GENERATION</Text>

      <View style={styles.divider} />

      <Text style={styles.warning}>
        ⚠  WRITE THESE 12 WORDS DOWN{'\n'}
        IN ORDER — STORE THEM SAFELY{'\n'}
        THIS IS YOUR ONLY BACKUP
      </Text>

      <View style={styles.divider} />

      {!revealed ? (
        <TouchableOpacity style={styles.revealBtn} onPress={handleReveal}>
          <Text style={styles.revealBtnText}>[ TAP TO REVEAL SEED PHRASE ]</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.wordGrid}>
          {words.map((word, i) => (
            <View key={i} style={styles.wordCell}>
              <Text style={styles.wordIndex}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={styles.wordText}>{word.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.notice}>
        NEVER SHARE THESE WORDS WITH ANYONE.{'\n'}
        ANYONE WHO ASKS FOR YOUR SEED PHRASE IS STEALING FROM YOU.
      </Text>

      <TouchableOpacity
        style={[styles.continueBtn, !revealed && styles.continueBtnDisabled]}
        onPress={handleContinue}
      >
        <Text style={styles.continueBtnText}>
          {revealed ? '[ I WROTE IT DOWN — CONTINUE ]' : '[ REVEAL SEED PHRASE FIRST ]'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.restoreBtn} onPress={onRestoreInstead}>
        <Text style={styles.restoreBtnText}>[ ALREADY HAVE A SEED PHRASE? RESTORE ]</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   Colors.black,
    paddingHorizontal: 24,
    paddingTop:        60,
    paddingBottom:     40,
  },
  title: {
    fontFamily:    'ShareTechMono',
    fontSize:      22,
    color:         Colors.green,
    letterSpacing: 4,
    marginBottom:  6,
    textAlign:     'center',
  },
  subtitle: {
    fontFamily:    'ShareTechMono',
    fontSize:      11,
    color:         Colors.greenDim,
    letterSpacing: 3,
    marginBottom:  20,
    textAlign:     'center',
  },
  divider: {
    width:           '100%',
    height:          1,
    backgroundColor: Colors.green,
    opacity:         0.2,
    marginVertical:  16,
  },
  warning: {
    fontFamily:    'ShareTechMono',
    fontSize:      12,
    color:         Colors.amber,
    letterSpacing: 1.5,
    lineHeight:    22,
    textAlign:     'center',
  },
  revealBtn: {
    borderWidth:     1,
    borderColor:     Colors.amber,
    padding:         20,
    alignItems:      'center',
    marginVertical:  16,
  },
  revealBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      13,
    color:         Colors.amber,
    letterSpacing: 2,
  },
  wordGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  wordCell: {
    width:           '48%',
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         10,
    marginBottom:    8,
  },
  wordIndex: {
    fontFamily:   'ShareTechMono',
    fontSize:     10,
    color:        Colors.greenDim,
    marginRight:  8,
    width:        20,
  },
  wordText: {
    fontFamily:    'ShareTechMono',
    fontSize:      13,
    color:         Colors.green,
    letterSpacing: 1,
  },
  notice: {
    fontFamily:    'ShareTechMono',
    fontSize:      10,
    color:         Colors.redDim,
    letterSpacing: 1,
    lineHeight:    18,
    textAlign:     'center',
    opacity:       0.8,
  },
  continueBtn: {
    borderWidth:     1,
    borderColor:     Colors.green,
    padding:         16,
    alignItems:      'center',
    marginTop:       16,
  },
  continueBtnDisabled: {
    borderColor: Colors.greenDark,
    opacity:     0.4,
  },
  continueBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      12,
    color:         Colors.green,
    letterSpacing: 2,
  },
  restoreBtn: {
    borderWidth:  1,
    borderColor:  Colors.borderDim,
    padding:      14,
    alignItems:   'center',
    marginTop:    12,
  },
  restoreBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      11,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
});
