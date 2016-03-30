/*
 * Copyright 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function exit() {
  process.exit();
}

function stop(e) {
  if (e) {
    console.log(e);
  }
  sc.stop().then(exit).catch(exit);
}

var spark = require('../../lib/index.js');

var sc = new spark.SparkContext("local[*]", "LBFGS Example");

var data = spark.mllib.util.MLUtils.loadLibSVMFile(sc, __dirname + "/data/sample_binary_classification_data.txt");

var ret = {};

data.take(1).then(function(results) {
  var numFeatures = results[0].features.length;

  // Split initial RDD into two... [60% training data, 40% testing data].
  var trainingInit = data.sample(false, 0.6, 11);
  var test = data.subtract(trainingInit);

  // Append 1 into the training data as intercept.
  var training = data.map(function (lp) {
    return new Tuple(lp.getLabel(), MLUtils.appendBias(lp.getFeatures()));
  });

  training.cache();

  // Run training algorithm to build the model.
  var numCorrections = 10;
  var convergenceTol = 0.0001;
  var maxNumIterations = 20;
  var regParam = 0.1;
  var w = [];
  for (var i = 0; i < numFeatures + 1; i++) {
    w.push(0.0);
  }
  var initialWeightsWithIntercept = spark.mllib.linalg.Vectors.dense(w);

  var run = spark.mllib.optimization.LBFGS.runLBFGS(
    training,
    new spark.mllib.optimization.LogisticGradient(),
    new spark.mllib.optimization.SquaredL2Updater(),
    numCorrections,
    convergenceTol,
    maxNumIterations,
    regParam,
    initialWeightsWithIntercept);

  run.then(function(result) {
    var weightsWithIntercept = result[0];
    var loss = result[1];

    var copyOfWeightsWithIntercept = [];
    for (var i = 0; i < weightsWithIntercept.length - 1; i++) {
      copyOfWeightsWithIntercept.push(weightsWithIntercept[i]);
    }

    var model = new spark.mllib.classification.LogisticRegressionModel(spark.mllib.linalg.Vectors.dense(copyOfWeightsWithIntercept), copyOfWeightsWithIntercept.length);

    var scoreAndLabels = test.map(function (lp, model) {
      return new Tuple(model.predict(lp.getFeatures()), lp.getLabel());
    }, [model]);

    // Get evaluation metrics.
    var metrics = new spark.mllib.evaluation.BinaryClassificationMetrics(scoreAndLabels);

    metrics.areaUnderROC().then(function(result) {
      console.log('Area under ROC:', result);
      stop();
    }).catch(stop);
  }).catch(stop);
}).catch(stop);
