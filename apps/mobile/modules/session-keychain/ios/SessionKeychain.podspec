Pod::Spec.new do |s|
  s.name           = 'SessionKeychain'
  s.version        = '1.0.0'
  s.summary        = 'The Pinkslip session token in the Keychain'
  s.description    = 'Reads and writes the session token at the Keychain item the Capacitor app used, so updating keeps people signed in.'
  s.author         = 'Pinkslip'
  s.homepage       = 'https://pinkslip.work'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
