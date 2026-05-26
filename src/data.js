export const defaultData = {
  dataVersion: 19,
  categories: ["カメラ", "レンズ", "スイッチャー", "モニター", "音声", "照明", "電源", "メディア", "ケーブル", "ネットワーク", "PC/収録", "消耗品", "その他"],
  equipment: [
    { id: "SW001", manufacturer: "Blackmagic Design", name: "ATEM Television Studio 4K Pro", category: "スイッチャー", quantity: 1, status: "OK", newPrice: 350000, rentalDay: 15000, manualUrl: "", imageUrl: "https://placehold.co/320x200/111827/ffffff?text=ATEM", productUrl: "", serial: "", notes: "本体・AC・USB-C確認", consumable: false },
    { id: "AUD001", manufacturer: "Sound Devices", name: "788T", category: "音声", quantity: 1, status: "OK", newPrice: 180000, rentalDay: 8000, manualUrl: "", imageUrl: "https://placehold.co/320x200/111827/ffffff?text=788T", productUrl: "", serial: "", notes: "メディア・電源・ヘッドホン出力確認", consumable: false },
    { id: "MON001", manufacturer: "SmallHD", name: "監督返しモニター 7inch", category: "モニター", quantity: 1, status: "OK", newPrice: 45000, rentalDay: 3000, manualUrl: "", imageUrl: "https://placehold.co/320x200/111827/ffffff?text=MONITOR", productUrl: "", serial: "", notes: "HDMI/SDI入力確認", consumable: false },
    { id: "CBL001", manufacturer: "CANARE", name: "SDIケーブル 5m", category: "ケーブル", quantity: 4, status: "OK", newPrice: 3000, rentalDay: 500, manualUrl: "", imageUrl: "https://placehold.co/320x200/111827/ffffff?text=SDI+5m", productUrl: "", serial: "", notes: "本数管理", consumable: false },
    { id: "BAT001", manufacturer: "", name: "単三電池", category: "消耗品", quantity: 20, status: "OK", newPrice: 80, rentalDay: 0, manualUrl: "", imageUrl: "https://placehold.co/320x200/111827/ffffff?text=AA", productUrl: "", serial: "", notes: "最低20本。使用後は数量更新", consumable: true }
  ],
  sets: [
    { name: "ATEM配信セット", description: "小〜中規模配信用", equipmentIds: ["SW001", "MON001", "CBL001"] },
    { name: "音声収録セット", description: "788T中心の音声収録", equipmentIds: ["AUD001", "CBL001", "BAT001"] }
  ],
  project: { name: "CM撮影 A案件", date: "", location: "スタジオ / ロケ地", client: "クライアント名", selectedSets: ["ATEM配信セット"] },
  checks: {},
  rentalQuote: { customer: "", subject: "", issueDate: "", days: 1, selectedIds: [], unitPrices: {}, quoteQuantities: {}, overridePrices: {}, memo: "" }
};
