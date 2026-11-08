Pod::Spec.new do |s|
  s.name           = 'AlertActions'
  s.version        = '1.0.0'
  s.summary        = 'Runs the buttons on a job alert without opening Pinkslip'
  s.homepage       = 'https://pinkslip.work'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'Pinkslip'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoNotifications'

  s.source_files = '**/*.swift'
end
