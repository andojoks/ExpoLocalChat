const {getDefaultConfig}=require('expo/metro-config');
const {withNativeWind}=require('nativewind/metro');
const config=getDefaultConfig(__dirname);
for(const extension of ['task','tflite','onnx','wasm'])if(!config.resolver.assetExts.includes(extension))config.resolver.assetExts.push(extension);
module.exports=withNativeWind(config,{input:'./src/global.css'});
