// screens/SeedRestoreScreen.js
// CapStash — Restore Wanderer wallet from existing BIP39 seed phrase

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, TextInput,
} from 'react-native';
import { validateMnemonic } from '../services/seedDerivation';
import Colors from '../theme/colors';

export default function SeedRestoreScreen({ onSeedRestored, onBack }) {
  const [words, setWords] = useState(Array(12).fill(''));
  const [activeIndex, setActiveIndex] = useState(null);

  const handleWordChange = (index, value) => {
    const updated = [...words];
    updated[index] = value.toLowerCase().trim();
    setWords(updated);
  };

  const handleRestore = () => {
    const mnemonic = words.join(' ').trim();
    const wordCount = words.filter(w => w.length > 0).length;

    if (wordCount !== 12) {
      Alert.alert(
        'INCOMPLETE SEED PHRASE',
        'You must enter all 12 words before restoring.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!validateMnemonic(mnemonic)) {
      Alert.alert(
        'INVALID SEED PHRASE',
        'One or more words are not valid BIP39 words.\n\nCheck your written seed phrase carefully.',
        [{ text: 'CHECK AGAIN' }]
      );
      return;
    }

    Alert.alert(
      '⚠ RESTORE WALLET',
      'This will restore your Wanderer wallet from your seed phrase.\n\nMake sure you are on a trusted device.',
      [
        { text: 'CANCEL', style: 'cancel' },
        { text: 'RESTORE', onPress: () => onSeedRestored(mnemonic) },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>☢ WANDERER RESTORE</Text>
      <Text style={styles.subtitle}>ENTER YOUR 12-WORD SEED PHRASE</Text>

      <View style={styles.divider} />

      <Text style={styles.warning}>
        {'ENTER YOUR WORDS EXACTLY AS WRITTEN\nIN THE CORRECT ORDER'}
      </Text>

      <View style={styles.divider} />

      <View style={styles.wordGrid}>
        {words.map((word, i) => (
          <View key={i} style={styles.wordRow}>
            <Text style={styles.wordIndex}>{String(i + 1).padStart(2, '0')}</Text>
            <TextInput
              style={[
                styles.wordInput,
                activeIndex === i && styles.wordInputActive,
              ]}
              value={word}
              onChangeText={v => handleWordChange(i, v)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              placeholder="word"
              placeholderTextColor={Colors.greenDim}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType={i < 11 ? 'next' : 'done'}
            />
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
        <Text style={styles.restoreBtnText}>[ RESTORE WALLET ]</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>[ BACK ]</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.black,
  },
  content: {
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
  wordGrid: {
    marginVertical: 8,
  },
  wordRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   8,
  },
  wordIndex: {
    fontFamily:  'ShareTechMono',
    fontSize:    11,
    color:       Colors.greenDim,
    width:       28,
  },
  wordInput: {
    flex:            1,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    color:           Colors.green,
    fontFamily:      'ShareTechMono',
    fontSize:        14,
    padding:         8,
    letterSpacing:   1,
  },
  wordInputActive: {
    borderColor: Colors.green,
  },
  restoreBtn: {
    borderWidth:  1,
    borderColor:  Colors.green,
    padding:      16,
    alignItems:   'center',
    marginBottom: 12,
  },
  restoreBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      13,
    color:         Colors.green,
    letterSpacing: 2,
  },
  backBtn: {
    borderWidth:  1,
    borderColor:  Colors.borderDim,
    padding:      14,
    alignItems:   'center',
  },
  backBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      12,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
});
