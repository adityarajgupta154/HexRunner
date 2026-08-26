import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { LiveInteraction } from '@workspace/api-client-react';

export function LiveInteractionsOverlay({
  events,
  onDismiss
}: {
  events: LiveInteraction[];
  onDismiss: (id: string) => void;
}) {
  const colors = useColors();
  
  if (events.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {events.map((event) => {
        const isContest = event.kind === 'contest';
        const displayName = event.displayName ? event.displayName.toUpperCase() : 'A RUNNER';
        
        return (
          <View 
            key={event.id}
            style={[styles.toast, { 
              backgroundColor: isContest ? colors.destructive : colors.card,
              borderColor: isContest ? colors.destructive : colors.primary
            }]}
          >
             <View style={styles.toastContent}>
               <Feather 
                 name={isContest ? 'alert-triangle' : 'radio'} 
                 size={18} 
                 color={isContest ? colors.destructiveForeground : colors.primary} 
               />
               <View style={styles.textContainer}>
                 {isContest ? (
                    <Text style={[styles.title, { color: colors.destructiveForeground }]}>
                      TERRITORY CONTEST
                    </Text>
                 ) : (
                    <Text style={[styles.title, { color: colors.foreground }]}>
                      {displayName} WAVED
                    </Text>
                 )}
                 <Text style={[styles.copy, { 
                   color: isContest ? colors.destructiveForeground : colors.mutedForeground,
                   opacity: isContest ? 0.9 : 1
                 }]}>
                   {event.copy}
                 </Text>
               </View>
             </View>
             <Pressable 
               onPress={() => onDismiss(event.id)}
               style={styles.dismissBtn}
               hitSlop={12}
             >
               <Feather 
                 name="x" 
                 size={20} 
                 color={isContest ? colors.destructiveForeground : colors.mutedForeground} 
               />
             </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  toastContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  copy: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
  dismissBtn: {
    padding: 4,
  }
});
