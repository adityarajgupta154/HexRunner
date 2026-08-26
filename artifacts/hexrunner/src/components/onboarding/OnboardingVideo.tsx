import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useReducedMotion } from 'react-native-reanimated';

interface Props {
  poster: any;
  source: any;
}

function NativeVideo({ source }: Pick<Props, 'source'>) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  const player = useVideoPlayer(source, p => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    const playTimer = setTimeout(() => {
      player.play();
    }, 60);

    return () => {
      clearTimeout(playTimer);
    };
  }, [player]);

  return (
    <VideoView
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        player={player}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: hasFirstFrame ? 1 : 0 }]}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setHasFirstFrame(true)}
        playsInline
      />
  );
}

export default function OnboardingVideo({ poster, source }: Props) {
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.container}>
      <Image
        testID="onboarding-poster"
        source={poster}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={reducedMotion ? 0 : 150}
      />

      {!reducedMotion ? <NativeVideo source={source} /> : null}

      <LinearGradient
        colors={[
          'rgba(11, 13, 18, 0.65)',
          'rgba(11, 13, 18, 0.1)',
          'rgba(11, 13, 18, 0.95)',
        ]}
        locations={[0, 0.4, 0.85]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
