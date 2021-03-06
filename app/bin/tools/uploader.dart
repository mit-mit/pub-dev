// Copyright (c) 2015, the Dart project authors.  Please see the AUTHORS file
// for details. All rights reserved. Use of this source code is governed by a
// BSD-style license that can be found in the LICENSE file.

import 'dart:async';
import 'dart:io';

import 'package:gcloud/db.dart';

import 'package:pub_dartlang_org/account/backend.dart';
import 'package:pub_dartlang_org/frontend/models.dart';
import 'package:pub_dartlang_org/frontend/service_utils.dart';
import 'package:pub_dartlang_org/history/backend.dart';
import 'package:pub_dartlang_org/history/models.dart';
import 'package:pub_dartlang_org/shared/email.dart';
import 'package:pub_dartlang_org/shared/package_memcache.dart';

Future main(List<String> arguments) async {
  if (arguments.length < 2 ||
      (!(arguments.length == 2 && arguments[0] == 'list') &&
          !(arguments.length == 3))) {
    print('Usage:');
    print('   ${Platform.script} list   <package>');
    print('   ${Platform.script} add    <package> <email-to-add>');
    print('   ${Platform.script} remove <package> <email-to-add>');
    exit(1);
  }

  final String command = arguments[0];
  final String package = arguments[1];
  final String uploader = arguments.length == 3 ? arguments[2] : null;

  await withProdServices(() async {
    registerAccountBackend(AccountBackend(dbService));
    registerHistoryBackend(HistoryBackend(dbService));
    if (command == 'list') {
      await listUploaders(package);
    } else if (command == 'add') {
      await addUploader(package, uploader);
      await _clearCache(package);
    } else if (command == 'remove') {
      await removeUploader(package, uploader);
      await _clearCache(package);
    }
  });

  exit(0);
}

Future listUploaders(String packageName) async {
  return dbService.withTransaction((Transaction T) async {
    final package =
        (await T.lookup([dbService.emptyKey.append(Package, id: packageName)]))
            .first as Package;
    if (package == null) {
      throw Exception('Package $packageName does not exist.');
    }
    final uploaderEmails =
        await accountBackend.getEmailsOfUserIds(package.uploaders);
    print('Current uploaders: $uploaderEmails');
  });
}

Future addUploader(String packageName, String uploaderEmail) async {
  return dbService.withTransaction((Transaction T) async {
    final package =
        (await T.lookup([dbService.emptyKey.append(Package, id: packageName)]))
            .first as Package;
    if (package == null) {
      throw Exception('Package $packageName does not exist.');
    }
    final uploaderEmails =
        await accountBackend.getEmailsOfUserIds(package.uploaders);
    print('Current uploaders: $uploaderEmails');
    final user = await accountBackend.lookupOrCreateUserByEmail(uploaderEmail);
    if (package.hasUploader(user.userId)) {
      throw Exception('Uploader $uploaderEmail already exists');
    }
    package.addUploader(user.userId);
    T.queueMutations(inserts: [package]);
    await T.commit();
    print('Uploader $uploaderEmail added to list of uploaders');

    final pubUser =
        await accountBackend.lookupOrCreateUserByEmail(pubDartlangOrgEmail);
    historyBackend.storeEvent(UploaderChanged(
      packageName: packageName,
      currentUserId: pubUser.userId,
      currentUserEmail: pubDartlangOrgEmail,
      addedUploaderEmails: [uploaderEmail],
    ));
  });
}

Future removeUploader(String packageName, String uploaderEmail) async {
  return dbService.withTransaction((Transaction T) async {
    final package =
        (await T.lookup([dbService.emptyKey.append(Package, id: packageName)]))
            .first as Package;
    if (package == null) {
      throw Exception('Package $packageName does not exist.');
    }

    final uploaderEmails =
        await accountBackend.getEmailsOfUserIds(package.uploaders);
    print('Current uploaders: $uploaderEmails');
    final user = await accountBackend.lookupOrCreateUserByEmail(uploaderEmail);
    if (!package.hasUploader(user.userId)) {
      throw Exception('Uploader $uploaderEmail does not exist');
    }
    if (package.uploaderCount <= 1) {
      throw Exception('Would remove last uploader');
    }
    package.removeUploader(user.userId);
    T.queueMutations(inserts: [package]);
    await T.commit();
    print('Uploader $uploaderEmail removed from list of uploaders');

    final pubUser =
        await accountBackend.lookupOrCreateUserByEmail(pubDartlangOrgEmail);
    historyBackend.storeEvent(UploaderChanged(
      packageName: packageName,
      currentUserId: pubUser.userId,
      currentUserEmail: pubDartlangOrgEmail,
      removedUploaderEmails: [uploaderEmail],
    ));
  });
}

Future _clearCache(String package) async {
  final cache = AppEnginePackageMemcache();
  await cache.invalidateUIPackagePage(package);
  await cache.invalidatePackageData(package);
}
