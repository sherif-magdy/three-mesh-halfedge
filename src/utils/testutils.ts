/*
 * Author: Axel Antoine
 * mail: ax.antoine@gmail.com
 * website: http://axantoine.com
 * Created on Thu Nov 10 2022
 *
 * Loki, Inria project-team with Université de Lille
 * within the Joint Research Unit UMR 9189
 * CNRS - Centrale Lille - Université de Lille, CRIStAL
 * https://loki.lille.inria.fr
 *
 * Licence: Licence.md
 */

export function generatorSize(g: Generator) {
  let cpt = 0;
  let v = g.next();
  while(!v.done) {
    cpt += 1;
    v = g.next();
  }
  return cpt;
}

export function generatorToArray<T>(g: Generator<T>) {
  const array = new Array<T>();
  let v = g.next();
  while(!v.done) {
    array.push(v.value);
    v = g.next();
  }
  return array;
}
