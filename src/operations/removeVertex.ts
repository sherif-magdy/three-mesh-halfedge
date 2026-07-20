/*
 * Author: Axel Antoine
 * mail: ax.antoine@gmail.com
 * website: http://axantoine.com
 * Created on Tue Oct 25 2022
 *
 * Loki, Inria project-team with Université de Lille
 * within the Joint Research Unit UMR 9189 
 * CNRS - Centrale Lille - Université de Lille, CRIStAL
 * https://loki.lille.inria.fr
 *
 * Licence: Licence.md
 */

import { HalfedgeDS } from "../core/HalfedgeDS";
import { Vertex } from "../core/Vertex";
import { removeEdge } from "./removeEdge";
import { removeFromArray } from "../utils/array";

/*
 *         From                            To    
 * 
 * 
 *            o                              o          
 *          ↙ ⇅ ↖                          ↙   ↖        
 *        ↙   ⇅   ↖                      ↙       ↖      
 *      ↙ f1  ⇅  f4 ↖                  ↙           ↖    
 *    ↙       ⇅       ↖              ↙               ↖  
 *  o ⇄ ⇄ ⇄ ⇄ v ⇄ ⇄ ⇄ ⇄ o          o         f         o
 *    ↘       ⇅       ↗              ↘               ↗  
 *      ↘ f2  ⇅  f3 ↗                  ↘           ↗    
 *        ↘   ⇅   ↗                      ↘       ↗      
 *          ↘ ⇅ ↗                          ↘   ↗        
 *            o                              o  
 * 
 * If all halfedges starting from vertex v to delete are connected to a face, 
 * then we create a new face v. 
 * If some of the halfedges starting from v are boundaries (i.e. no face), 
 * then we can't create a new face.
 *         
 */  


export function removeVertex(
    struct: HalfedgeDS,
    vertex: Vertex,
    mergeFaces = true) {

  // Drain the one-ring generator into a static array BEFORE mutating.
  // removeEdge rewrites the very twin/next pointers that loopCW walks
  // (curr.twin.next), so iterating it live cycles on the mutated pointers
  // and never terminates.
  const halfedges = Array.from(vertex.loopCW());
  for (const halfedge of halfedges) {
    removeEdge(struct, halfedge, mergeFaces);
  }

  removeFromArray(struct.vertices, vertex);
}