// screens/SeedVerifyScreen.js
// Wanderer first-launch — verify user wrote down their seed phrase
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Colors from '../theme/colors';

export default function SeedVerifyScreen({ mnemonic, onVerified, onBack }) {
  const [challenges, setChallenges] = useState([]);
  const [answers,    setAnswers]    = useState({});

  useEffect(() => {
    if (!mnemonic) return;
    const words = mnemonic.split(' ');
    // Pick 4 random positions to verify
    const positions = [];
    while (positions.length < 4) {
      const idx = Math.floor(Math.random() * 12);
      if (!positions.includes(idx)) positions.push(idx);
    }
    positions.sort((a, b) => a - b);
    setChallenges(positions.map(i => ({ index: i, word: words[i] })));
    setAnswers({});
  }, [mnemonic]);

  const handleVerify = () => {
    const allCorrect = challenges.every(c => {
      const answer = (answers[c.index] || '').trim().toLowerCase();
      return answer === c.word.toLowerCase();
    });

    if (!allCorrect) {
      Alert.alert(
        'INCORRECT',
        'One or more words are wrong.\n\nCheck your written seed phrase and try again.',
        [{ text: 'TRY AGAIN' }]
      );
      setAnswers({});
      return;
    }

    onVerified();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>☢ VAULT VERIFICATION</Text>
        <Text style={styles.subtitle}>CONFIRM YOUR SEED PHRASE</Text>

        <View style={styles.divider} />

        <Text style={styles.instructions}>
          ENTER THE WORDS AT THE POSITIONS BELOW{'\n'}
          TO CONFIRM YOU HAVE YOUR SEED PHRASE WRITTEN DOWN
        </Text>

        <View style={styles.divider} />

        {challenges.map(c => (
          <View key={c.index} style={styles.challengeRow}>
            <Text style={styles.challengeLabel}>
              WORD #{String(c.index + 1).padStart(2, '0')}
            </Text>
            <TextInput
              style={styles.input}
              value={answers[c.index] || ''}
              onChangeText={t => setAnswers(prev => ({ ...prev, [c.index]: t }))}
              placeholder="enter word..."
              placeholderTextColor={Colors.greenDark}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>
        ))}

        <View style={styles.divider} />

        <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify}>
          <Text style={styles.verifyBtnText}>[ VERIFY SEED PHRASE ]</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>[ BACK — VIEW SEED AGAIN ]</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
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
  instructions: {
    fontFamily:    'ShareTechMono',
    fontSize:      11,
    color:         Colors.amber,
    letterSpacing: 1.5,
    lineHeight:    20,
    textAlign:     'center',
  },
  challengeRow: {
    marginBottom: 16,
  },
  challengeLabel: {
    fontFamily:    'ShareTechMono',
    fontSize:      11,
    color:         Colors.greenDim,
    letterSpacing: 2,
    marginBottom:  6,
  },
  input: {
    fontFamily:      'ShareTechMono',
    fontSize:        16,
    color:           Colors.green,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         12,
    letterSpacing:   2,
  },
  verifyBtn: {
    borderWidth:  1,
    borderColor:  Colors.green,
    padding:      16,
    alignItems:   'center',
    marginBottom: 12,
  },
  verifyBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      13,
    color:         Colors.green,
    letterSpacing: 2,
  },
  backBtn: {
    borderWidth:  1,
    borderColor:  Colors.greenDark,
    padding:      14,
    alignItems:   'center',
  },
  backBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      11,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
});
