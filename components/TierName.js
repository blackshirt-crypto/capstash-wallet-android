// components/TierName.js
// N.U.K.A — Renders a wasteland identity name with tier-appropriate
// color, glow, and animation effects.

import React, { useEffect, useRef } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { generateWastelandName, getTierStyle } from '../utils/wasteland';
import Typography from '../theme/typography';

export default function TierName({
  address,
  size = 'amount',     // key from Typography
  showVerified = false,
  showAlias = false,
  alias = '',
  style,
}) {
  const { fullName, tier, verified } = generateWastelandName(address);
  const tierStyle = getTierStyle(tier);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Pulse glow for rare and legendary tiers
  useEffect(() => {
    if (tier === 'rare' || tier === 'legendary') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 1000, useNativeDriver: false }),
        ])
      ).start();
    }
  }, [tier]);

  // Shimmer animation for mythic tier
  useEffect(() => {
    if (tier === 'mythic') {
      Animated.loop(
        Animated.timing(shimmerAnim, { toValue: 1, duration: 3000, useNativeDriver: false })
      ).start();
    }
  }, [tier]);

  const baseStyle = [
    Typography[size] || Typography.amount,
    style,
  ];

  // Mythic — animated gradient text
  if (tier === 'mythic') {
    return (
      <MaskedView maskElement={
        <Text style={[...baseStyle, styles.mythicMask]}>{fullName}</Text>
      }>
        <LinearGradient
          colors={['#ff69b4', '#b44fff', '#ff69b4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[...baseStyle, { opacity: 0 }]}>{fullName}</Text>
        </LinearGradient>
      </MaskedView>
    );
  }

  // Rare / Legendary — pulsing glow via shadow
  if (tier === 'rare' || tier === 'legendary') {
    return (
      <Animated.Text style={[
        ...baseStyle,
        {
          color: tierStyle.color,
          textShadowColor: tierStyle.color,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: pulseAnim,
        },
      ]}>
        {fullName}
        {showVerified && verified && <Text style={styles.verified}> ⬡</Text>}
        {showAlias && alias ? <Text style={styles.alias}>{'\n'}{alias}</Text> : null}
      </Animated.Text>
    );
  }

  // Common / Uncommon — simple colored text
  return (
    <Text style={[
      ...baseStyle,
      {
        color: tierStyle.color,
        textShadowColor: tierStyle.color,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
      },
    ]}>
      {fullName}
      {showVerified && verified && <Text style={styles.verified}> ⬡</Text>}
      {showAlias && alias ? <Text style={styles.alias}>{'\n'}{alias}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  mythicMask: {
    color: 'black',
    backgroundColor: 'transparent',
  },
  verified: {
    fontSize: 10,
    color: '#1a7a06',
  },
  alias: {
    fontSize: 9,
    color: '#ffb000',
    letterSpacing: 1,
  },
});
