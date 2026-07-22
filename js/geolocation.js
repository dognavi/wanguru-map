export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      ...options,
    });
  });
}

export function describeGeolocationError(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "位置情報の利用が許可されませんでした。地名で検索してください";
    case error.POSITION_UNAVAILABLE:
      return "現在地を取得できませんでした。地名で検索してください";
    case error.TIMEOUT:
      return "現在地の取得がタイムアウトしました。地名で検索してください";
    default:
      return "現在地を取得できませんでした。地名で検索してください";
  }
}
