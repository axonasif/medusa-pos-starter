import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { barcodeTypes } from '@/utils/barcode-types';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Linking, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function AdminBarcodeScanner({ onScan, onCancel }: { onScan: (barcode: string) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = React.useState(false);
  const scanned = React.useRef(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView className="flex-1 bg-black">
        {permission?.granted ? (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torch}
              autofocus="on"
              barcodeScannerSettings={{ barcodeTypes }}
              onBarcodeScanned={({ data }) => {
                if (scanned.current || !data) return;
                scanned.current = true;
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onScan(data);
              }}
            />
            <View className="p-5">
              <Text className="mb-4 text-center text-white">
                Scan the variant’s barcode. This fills the field; it does not save.
              </Text>
              <Button variant="outline" onPress={() => setTorch((value) => !value)}>
                {torch ? 'Turn torch off' : 'Turn torch on'}
              </Button>
            </View>
          </>
        ) : (
          <View className="flex-1 justify-center gap-5 p-6">
            <Text className="text-white">Camera permission is needed to scan a barcode.</Text>
            <Button onPress={() => (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())}>
              {permission?.canAskAgain === false ? 'Open app settings' : 'Allow camera'}
            </Button>
          </View>
        )}
        <View className="p-5">
          <Button onPress={onCancel}>Cancel</Button>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
