import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import resolveAssetSource from 'expo-video/build/resolveAssetSource.web';
import { useReducedMotion } from 'react-native-reanimated';

interface Props {
  poster: any;
  source: any;
}

export default function OnboardingVideo({ poster, source }: Props) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reducedMotion = useReducedMotion();
  const sourceUri = useMemo(() => {
    if (typeof source === 'string') return source;
    if (typeof source?.uri === 'string') return source.uri;

    const assetId =
      typeof source === 'number' ? source : source?.assetId;
    return typeof assetId === 'number'
      ? resolveAssetSource(assetId)?.uri ?? ''
      : '';
  }, [source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    void video.play().catch(() => {
      // The representative frame remains visible if browser autoplay is unavailable.
    });

    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [reducedMotion, sourceUri]);

  return (
    <View style={styles.container}>
      <Image
        testID="onboarding-poster"
        source={poster}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={reducedMotion ? 0 : 150}
      />

      {!reducedMotion ? (
        <video
          ref={videoRef}
          aria-hidden
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          src={sourceUri}
          onCanPlay={() => {
            setHasFirstFrame(true);
            void videoRef.current?.play();
          }}
          onLoadedData={() => setHasFirstFrame(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
            objectFit: 'cover',
            opacity: hasFirstFrame ? 1 : 0,
            pointerEvents: 'none',
          }}
        />
      ) : null}

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